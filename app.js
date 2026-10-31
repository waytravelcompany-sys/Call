
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const $ = id => document.getElementById(id);
const cfg = window.TRUE_CHAT_CONFIG;
const ready = Boolean(
  cfg?.supabaseUrl?.startsWith('https://') &&
  cfg?.supabaseAnonKey &&
  !cfg.supabaseAnonKey.startsWith('VOTRE_')
);
const db = ready
  ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
  : null;
let me = null;
let profile = null;
let signup = false;
let room = null;
let roomChannel = null;
let authListener = null;
let bootedFor = null;
let currentTab = 'chats';
let selectedMedia = null;
let lockInitDone = false;
const $show = (id, on) => {
  const el = $(id);
  if (el) el.hidden = !on;
};
function notify(message) {
  const el = $('notice');
  if (!el) {
    alert(message);
    return;
  }
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    el.style.display = 'none';
  }, 5000);
}
function errorMessage(error) {
  console.error('TRUE CHAT:', error);
  notify(error?.message || 'Une erreur est survenue.');
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}
function setBusy(button, busy, text) {
  if (!button) return;
  if (busy) {
    button.dataset.originalHtml = button.innerHTML;
    button.textContent = text || 'Patientez...';
    button.disabled = true;
  } else {
    if (button.dataset.originalHtml !== undefined) {
      button.innerHTML = button.dataset.originalHtml;
    }
    button.disabled = false;
  }
}
function validUsername(value) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(value);
}
/* ---------- numéro de téléphone ---------- */
let HAS_PHONE = true; // passe à false si la colonne profiles.phone n'existe pas encore
const PROFILE_BASE = 'id, username, full_name, avatar_url, bio, last_seen';
const profileCols = () => PROFILE_BASE + (HAS_PHONE ? ', phone' : '');
const MIN_PHONE_DIGITS = 9;

// [code ISO, nom, indicatif] — les plus proches en premier, puis ordre alphabétique
const COUNTRIES_TOP = [
  ['BI', 'Burundi', '257'], ['CD', 'RD Congo', '243'], ['RW', 'Rwanda', '250'],
  ['TZ', 'Tanzanie', '255'], ['UG', 'Ouganda', '256'], ['KE', 'Kenya', '254']
];
const COUNTRIES_MORE = [
  ['ZA', 'Afrique du Sud', '27'], ['DZ', 'Algérie', '213'], ['DE', 'Allemagne', '49'], ['AO', 'Angola', '244'],
  ['SA', 'Arabie saoudite', '966'], ['AR', 'Argentine', '54'], ['AU', 'Australie', '61'], ['AT', 'Autriche', '43'],
  ['BE', 'Belgique', '32'], ['BJ', 'Bénin', '229'], ['BW', 'Botswana', '267'], ['BR', 'Brésil', '55'],
  ['BF', 'Burkina Faso', '226'], ['CM', 'Cameroun', '237'], ['CA', 'Canada', '1'], ['CV', 'Cap-Vert', '238'],
  ['CF', 'Centrafrique', '236'], ['CL', 'Chili', '56'], ['CN', 'Chine', '86'], ['CG', 'Congo-Brazzaville', '242'],
  ['KR', 'Corée du Sud', '82'], ['CI', "Côte d'Ivoire", '225'], ['DK', 'Danemark', '45'], ['DJ', 'Djibouti', '253'],
  ['EG', 'Égypte', '20'], ['AE', 'Émirats arabes unis', '971'], ['ER', 'Érythrée', '291'], ['ES', 'Espagne', '34'],
  ['US', 'États-Unis', '1'], ['ET', 'Éthiopie', '251'], ['FI', 'Finlande', '358'], ['FR', 'France', '33'],
  ['GA', 'Gabon', '241'], ['GM', 'Gambie', '220'], ['GH', 'Ghana', '233'], ['GN', 'Guinée', '224'],
  ['GQ', 'Guinée équatoriale', '240'], ['HT', 'Haïti', '509'], ['IN', 'Inde', '91'], ['ID', 'Indonésie', '62'],
  ['IE', 'Irlande', '353'], ['IL', 'Israël', '972'], ['IT', 'Italie', '39'], ['JP', 'Japon', '81'],
  ['KM', 'Comores', '269'], ['LR', 'Liberia', '231'], ['LY', 'Libye', '218'], ['LU', 'Luxembourg', '352'],
  ['MG', 'Madagascar', '261'], ['MW', 'Malawi', '265'], ['ML', 'Mali', '223'], ['MA', 'Maroc', '212'],
  ['MU', 'Maurice', '230'], ['MR', 'Mauritanie', '222'], ['MX', 'Mexique', '52'], ['MZ', 'Mozambique', '258'],
  ['NA', 'Namibie', '264'], ['NE', 'Niger', '227'], ['NG', 'Nigeria', '234'], ['NO', 'Norvège', '47'],
  ['PK', 'Pakistan', '92'], ['NL', 'Pays-Bas', '31'], ['PL', 'Pologne', '48'], ['PT', 'Portugal', '351'],
  ['QA', 'Qatar', '974'], ['GB', 'Royaume-Uni', '44'], ['RU', 'Russie', '7'], ['SN', 'Sénégal', '221'],
  ['SC', 'Seychelles', '248'], ['SL', 'Sierra Leone', '232'], ['SO', 'Somalie', '252'], ['SD', 'Soudan', '249'],
  ['SS', 'Soudan du Sud', '211'], ['SE', 'Suède', '46'], ['CH', 'Suisse', '41'], ['TD', 'Tchad', '235'],
  ['TG', 'Togo', '228'], ['TN', 'Tunisie', '216'], ['TR', 'Turquie', '90'], ['ZM', 'Zambie', '260'],
  ['ZW', 'Zimbabwe', '263']
];
const COUNTRIES = [...COUNTRIES_TOP, ...COUNTRIES_MORE];
const DIALS_DESC = [...new Set(COUNTRIES.map(country => country[2]))]
  .sort((a, b) => b.length - a.length);
const TZ_COUNTRY = {
  'Africa/Bujumbura': 'BI', 'Africa/Kinshasa': 'CD', 'Africa/Lubumbashi': 'CD', 'Africa/Kigali': 'RW',
  'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kampala': 'UG', 'Africa/Nairobi': 'KE', 'Africa/Lusaka': 'ZM',
  'Africa/Brazzaville': 'CG', 'Africa/Luanda': 'AO', 'Africa/Johannesburg': 'ZA', 'Africa/Addis_Ababa': 'ET',
  'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Abidjan': 'CI', 'Africa/Dakar': 'SN',
  'Africa/Douala': 'CM', 'Africa/Libreville': 'GA', 'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA',
  'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Maputo': 'MZ', 'Africa/Harare': 'ZW',
  'Africa/Blantyre': 'MW', 'Indian/Antananarivo': 'MG', 'Europe/Paris': 'FR', 'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH', 'Europe/Berlin': 'DE', 'Europe/London': 'GB', 'Europe/Rome': 'IT',
  'Europe/Madrid': 'ES', 'America/Toronto': 'CA', 'America/Montreal': 'CA', 'America/New_York': 'US'
};
const countryByIso = iso => COUNTRIES.find(country => country[0] === iso);
const flagOf = iso => String.fromCodePoint(...[...iso].map(ch => 127397 + ch.charCodeAt(0)));
// Pays proposé automatiquement : dernier choix, pays du numéro du profil, fuseau horaire, langue, sinon Burundi
function detectCountry() {
  try {
    const saved = localStorage.getItem('truechat.country');
    if (saved && countryByIso(saved)) return saved;
  } catch (error) { /* stockage indisponible */ }
  const own = String(profile?.phone || '').replace(/\D/g, '');
  if (own) {
    const dial = DIALS_DESC.find(code => own.startsWith(code));
    const match = dial && COUNTRIES.find(country => country[2] === dial);
    if (match) return match[0];
  }
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ_COUNTRY[zone]) return TZ_COUNTRY[zone];
  } catch (error) { /* ignoré */ }
  const region = String(navigator.language || '').split('-')[1];
  if (region && countryByIso(region.toUpperCase())) return region.toUpperCase();
  return 'BI';
}
const countryPickers = [];
function bindCountryPicker(selectId, labelId) {
  const select = $(selectId);
  const label = $(labelId);
  if (!select) return;
  COUNTRIES.forEach(([iso, name, dial]) => {
    const option = document.createElement('option');
    option.value = iso;
    option.textContent = flagOf(iso) + '  ' + name + '  (+' + dial + ')';
    select.append(option);
  });
  countryPickers.push({ select, label });
  select.addEventListener('change', () => {
    try { localStorage.setItem('truechat.country', select.value); } catch (error) { /* ignoré */ }
    syncCountryPickers(select.value);
    if ($('newChat') && !$('newChat').hidden) $('ncSearch')?.dispatchEvent(new Event('input'));
  });
}
function syncCountryPickers(iso) {
  const country = countryByIso(iso || detectCountry()) || COUNTRIES[0];
  countryPickers.forEach(({ select, label }) => {
    select.value = country[0];
    if (label) label.textContent = flagOf(country[0]) + ' +' + country[2];
  });
}
bindCountryPicker('phoneCountry', 'phoneCcLabel');
bindCountryPicker('ncCountry', 'ncCcLabel');
syncCountryPickers();
const currentDial = () => (countryByIso($('phoneCountry')?.value || detectCountry()) || COUNTRIES[0])[2];

// Chiffres seulement, avec l'indicatif. Sans « + », l'indicatif du pays choisi est ajouté tout seul.
function normalizePhone(value, dial = currentDial()) {
  const text = String(value || '').trim();
  let digits = text.replace(/\D/g, '');
  if (!digits) return '';
  if (text.startsWith('+')) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith(dial) && digits.length >= dial.length + 8) return digits;
  digits = digits.replace(/^0+/, '');
  return dial + digits;
}
function validPhone(digits) {
  return /^[1-9]\d{8,14}$/.test(digits);
}
function groupRest(rest) {
  if (rest.length === 9) return rest.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
  if (rest.length === 8) return rest.replace(/(\d{2})(\d{3})(\d{3})/, '$1 $2 $3');
  return rest.replace(/(\d{3})(?=\d)/g, '$1 ');
}
function formatPhone(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (!d) return '';
  const dial = DIALS_DESC.find(code => d.startsWith(code));
  if (!dial) return '+' + d;
  return '+' + dial + ' ' + groupRest(d.slice(dial.length));
}
// Ce que la personne tape ressemble à un numéro (et non à un nom)
function isPhoneQuery(raw) {
  const text = String(raw || '').trim();
  return /^[+\d\s().-]+$/.test(text) && text.replace(/\D/g, '').length >= 3;
}
const phoneDigits = raw => normalizePhone(raw);
async function searchByPhone(raw) {
  return findProfiles(raw);
}
async function addContact(personId) {
  if (!me || !personId) return;
  try {
    await db.from('contacts').insert({ owner_id: me.id, contact_id: personId });
  } catch (error) {
    /* déjà dans les contacts */
  }
}
/* =====================================================
   AUTHENTIFICATION
===================================================== */
function setAuthMode(isSignup) {
  signup = isSignup;
  const button = $('authSubmit');
  const toggle = $('toggleAuth');
  const password = $('password');
  const name = $('name');
  const phone = $('phone');
  if (button) {
    button.textContent = signup
      ? 'Créer mon compte'
      : 'Se connecter';
  }
  if (toggle) {
    toggle.textContent = signup ? 'Connexion' : 'Créer un compte';
  }
  if ($('toggleLead')) {
    $('toggleLead').textContent = signup ? 'Déjà inscrit ?' : 'Pas encore de compte ?';
  }
  if ($('authTitle')) {
    $('authTitle').textContent = signup ? 'Créer un compte' : 'Bon retour';
  }
  if ($('authSub')) {
    $('authSub').textContent = signup
      ? 'Rejoignez TRUE CHAT en quelques secondes.'
      : 'Connectez-vous pour continuer.';
  }
  if ($('fieldName')) $('fieldName').hidden = !signup;
  if ($('fieldPhone')) $('fieldPhone').hidden = !signup;
  if ($('authHint')) $('authHint').hidden = !signup;
  if ($('emailLabel')) $('emailLabel').textContent = signup ? 'Adresse Gmail' : 'Adresse e-mail';
  if (name) name.required = signup;
  if (phone) phone.required = signup;
  if (password) {
    password.autocomplete = signup
      ? 'new-password'
      : 'current-password';
  }
}
$('toggleAuth')?.addEventListener('click', () => {
  setAuthMode(!signup);
});
setAuthMode(false);
let loginAnimating = false;
async function playLoginSuccess() {
  const card = $('auth');
  if (!card) return;
  card.classList.add('ok');
  await new Promise(resolve => setTimeout(resolve, 2100));
}
try {
  const savedEmail = localStorage.getItem('truechat_email');
  if (savedEmail && $('email')) {
    $('email').value = savedEmail;
    if ($('remember')) $('remember').checked = true;
  }
} catch (error) {
  /* stockage indisponible */
}
function rememberEmail(email) {
  try {
    if ($('remember')?.checked) localStorage.setItem('truechat_email', email);
    else localStorage.removeItem('truechat_email');
  } catch (error) {
    /* ignoré */
  }
}
$('authForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!db) {
    notify('Vérifiez les paramètres Supabase dans config.js.');
    return;
  }
  const email = $('email').value.trim();
  const password = $('password').value;
  const fullName = $('name').value.trim();
  const phone = normalizePhone($('phone')?.value);
  const button = $('authSubmit');
  setBusy(button, true, 'Connexion...');
  $('auth')?.classList.remove('ok');
  loginAnimating = true;
  try {
    if (signup) {
      if (!fullName) {
        throw new Error('Entrez votre nom complet.');
      }
      if (!validPhone(phone)) {
        throw new Error(
          'Entrez un numéro de téléphone valide (le pays choisi ajoute l’indicatif tout seul).'
        );
      }
      // Numéro déjà pris ? (si la fonction SQL phone_exists n'existe pas encore, on continue)
      const { data: taken, error: phoneError } = await db.rpc('phone_exists', { p: phone });
      if (!phoneError && taken === true) {
        throw new Error('Ce numéro est déjà utilisé par un autre compte.');
      }
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone
          }
        }
      });
      if (error) throw error;
      if (!data.session) {
        notify(
          'Compte demandé. Vérifiez votre email pour confirmer votre inscription, puis connectez-vous.'
        );
        return;
      }
      me = data.user;
      rememberEmail(email);
      await playLoginSuccess();
      loginAnimating = false;
      await initialize();
    } else {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      me = data.user;
      rememberEmail(email);
      await playLoginSuccess();
      loginAnimating = false;
      await initialize();
    }
  } catch (error) {
    $('auth')?.classList.remove('ok');
    errorMessage(error);
  } finally {
    loginAnimating = false;
    setBusy(button, false);
  }
});
$('forgotPassword')?.addEventListener('click', async () => {
  if (!db) {
    notify('Supabase n’est pas configuré.');
    return;
  }
  const email = $('email').value.trim();
  if (!email) {
    notify('Entrez votre adresse email avant de continuer.');
    return;
  }
  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
    if (error) throw error;
    notify('Si cette adresse est enregistrée, un email de réinitialisation sera envoyé.');
  } catch (error) {
    errorMessage(error);
  }
});
$('logout')?.addEventListener('click', async () => {
  if (!db) return;
  try {
    if (roomChannel) {
      await db.removeChannel(roomChannel);
      roomChannel = null;
    }
    const { error } = await db.auth.signOut();
    if (error) throw error;
    me = null;
    bootedFor = null;
    profile = null;
    room = null;
    renderAuth();
  } catch (error) {
    errorMessage(error);
  }
});
/* =====================================================
   PROFIL
===================================================== */
async function loadProfile() {
  if (!me) return;
  let { data, error } = await db
    .from('profiles')
    .select(profileCols())
    .eq('id', me.id)
    .maybeSingle();
  if (error && HAS_PHONE && /phone|42703/i.test((error.code || '') + ' ' + (error.message || ''))) {
    // la colonne phone n'existe pas encore : exécuter SETUP-telephone.sql
    HAS_PHONE = false;
    ({ data, error } = await db
      .from('profiles')
      .select(profileCols())
      .eq('id', me.id)
      .maybeSingle());
  }
  if (error) throw error;
  profile = data;
  /*
   * Le trigger SQL crée d'abord un username automatique.
   * On tente de remplacer ce nom par celui choisi à l'inscription.
   */
  const wantedUsername = me.user_metadata?.username;
  if (
    profile &&
    wantedUsername &&
    profile.username?.startsWith('user_') &&
    validUsername(wantedUsername)
  ) {
    const { data: updated, error: updateError } = await db
      .from('profiles')
      .update({
        username: wantedUsername,
        full_name: me.user_metadata?.full_name || profile.full_name || ''
      })
      .eq('id', me.id)
      .select(profileCols())
      .maybeSingle();
    if (!updateError && updated) {
      profile = updated;
    } else if (updateError) {
      console.warn('Profil non modifié:', updateError.message);
    }
  }
  // Numéro choisi à l'inscription : on l'enregistre dans le profil à la première connexion
  if (HAS_PHONE && profile && !profile.phone) {
    const wantedPhone = normalizePhone(me.user_metadata?.phone);
    if (validPhone(wantedPhone)) {
      const { data: withPhone, error: phoneError } = await db
        .from('profiles')
        .update({ phone: wantedPhone })
        .eq('id', me.id)
        .select(profileCols())
        .maybeSingle();
      if (!phoneError && withPhone) {
        profile = withPhone;
      } else if (phoneError?.code === '23505') {
        notify('Ce numéro est déjà utilisé par un autre compte.');
      } else if (phoneError) {
        console.warn('Numéro non enregistré:', phoneError.message);
      }
    }
  }
  renderProfile();
}
function setAvatar(el, url, label) {
  if (!el) return;
  if (url) {
    el.style.background =
      'center / cover no-repeat url("' + String(url).replace(/"/g, '%22') + '")';
    el.textContent = '';
  } else {
    el.style.background = avatarColor(label);
    el.textContent = initials(label);
  }
}
function renderProfile() {
  if (!profile) return;
  const label = profile.full_name || profile.username || 'Utilisateur';
  if ($('profName')) $('profName').textContent = label + ' (vous)';
  if ($('profUser')) $('profUser').textContent = formatPhone(profile.phone);
  setAvatar($('profAvatar'), profile.avatar_url, label);
  setAvatar($('navAvatar'), profile.avatar_url, label);
  positionNav(true);
  if ($('welcomeUser')) {
    $('welcomeUser').textContent = 'Bienvenue, ' + label;
  }
  if ($('profilePage') && !$('profilePage').hidden) renderProfilePage();
}
$('editProfile')?.addEventListener('click', openProfilePage);
$('profName')?.addEventListener('click', openProfilePage);
/* =====================================================
   INITIALISATION
===================================================== */
async function initialize() {
  if (!db || !me) return;
  try {
    const cachedProfile = cacheGet('profile');
    if (cachedProfile && !profile) {
      profile = cachedProfile;
      renderProfile();
    }
    try {
      await loadProfile();
      cacheSet('profile', profile);
    } catch (profileError) {
      if (!isNetworkError(profileError)) throw profileError;
      profile = cacheGet('profile');
      if (profile) renderProfile();
    }
    renderAuth();
    if (HAS_PHONE && profile && !profile.phone) {
      notify('Ajoutez votre numéro : Vous → Modifier, pour que vos proches puissent vous trouver.');
    }
    loadPrefs();
    await probeFeatures();
    renderSettingsRows();
    if (!lockInitDone) {
      lockInitDone = true;
      showLockScreen();
    }
    await loadChats();
    await loadNotifications().catch(error => {
      if (!isNetworkError(error)) throw error;
    });
    syncPushSubscription().catch(error => console.warn('Push:', error));
    handlePendingRoom();
    startInbox();
    flushOutbox();
  } catch (error) {
    errorMessage(error);
  }
}
function handlePendingRoom() {
  const match = /room=([0-9a-f-]{36})/i.exec(location.hash);
  if (!match) return;
  history.replaceState(null, '', location.pathname + location.search);
  openRoom(match[1]).catch(errorMessage);
}
navigator.serviceWorker?.addEventListener('message', event => {
  if (event.data?.type === 'open-room' && me && event.data.id) {
    openRoom(event.data.id).catch(errorMessage);
  }
});
function renderAuth() {
  $show('auth', !me);
  $show('home', Boolean(me));
  $show('room', false);
  $show('logout', Boolean(me));
  if (me) requestAnimationFrame(() => positionNav(true));
  if (!me) {
    stopInbox();
    closeSheet();
    $show('lockScreen', false);
    cancelVoiceRecording();
    $('auth')?.classList.remove('ok');
    room = null;
    if (roomChannel && db) {
      db.removeChannel(roomChannel);
      roomChannel = null;
    }
  }
}
/* =====================================================
   RECHERCHE D'UTILISATEURS
===================================================== */
$('searchForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!me) return;
  const term = $('findEmail').value.trim();
  if (term.length < 3) {
    notify('Entrez au moins 3 caractères.');
    return;
  }
  const phoneMode = isPhoneQuery(term);
  if (phoneMode && phoneDigits(term).length < MIN_PHONE_DIGITS) {
    notify('Entrez le numéro complet, sans oublier le pays (ex : 79 123 456).');
    return;
  }
  const button = $('findUser');
  setBusy(button, true, 'Recherche...');
  try {
    /* Un numéro se cherche par son numéro ; sinon on cherche dans les noms. */
    let data;
    if (phoneMode) {
      data = await searchByPhone(term);
    } else {
      const safeTerm = term.replace(/[,%()_\\]/g, '');
      const result = await db
        .from('profiles')
        .select('id, username, full_name, avatar_url, bio')
        .ilike('full_name', `%${safeTerm}%`)
        .neq('id', me.id)
        .limit(20);
      if (result.error) throw result.error;
      data = result.data;
    }
    const box = $('found');
    box.replaceChildren();
    if (!data?.length) {
      box.textContent =
        'Aucun utilisateur trouvé. Essayez son numéro de téléphone complet.';
      return;
    }
    data.forEach(user => {
      const card = document.createElement('div');
      card.className = 'panel';
      const title = document.createElement('p');
      title.textContent =
        (user.full_name || 'Utilisateur') +
        (user.phone ? ' — ' + formatPhone(user.phone) : '');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Envoyer un message';
      button.onclick = async () => {
        if (phoneMode) await addContact(user.id);
        startPrivateChat(user.id);
      };
      card.append(title, button);
      box.append(card);
    });
  } catch (error) {
    errorMessage(error);
  } finally {
    setBusy(button, false);
  }
});
/* =====================================================
   CONVERSATIONS
===================================================== */
async function startPrivateChat(otherId) {
  try {
    const { data, error } = await db.rpc(
      'create_private_conversation',
      { other_id: otherId }
    );
    if (error) throw error;
    if (!data) {
      throw new Error('La conversation n’a pas pu être créée.');
    }
    await loadChats();
    await openRoom(data);
  } catch (error) {
    errorMessage(error);
  }
}
let chatRows = [];
let chatFilter = 'all';
let chatQuery = '';
const ICON_TICK =
  '<svg class="tick" viewBox="0 0 20 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 9 4 4L17 3"/></svg>';
const ICON_MIC =
  '<svg class="mic" viewBox="3 1 18 22" fill="currentColor"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 0 0-2 0 4 4 0 0 1-8 0 1 1 0 0 0-2 0 6 6 0 0 0 5 5.9V20H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.6a6 6 0 0 0 5-5.9Z"/></svg>';
function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}
function avatarColor(seed) {
  let hue = 0;
  for (const char of String(seed)) {
    hue = (hue * 47 + char.charCodeAt(0) * 13) % 360;
  }
  return 'hsl(' + hue + ' 32% 32%)';
}
function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(date)) / 86400000);
  if (diff <= 0) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff === 1) return 'Hier';
  if (diff < 7) return date.toLocaleDateString('fr-FR', { weekday: 'long' });
  return date.toLocaleDateString('fr-FR');
}
function previewOf(last) {
  if (!last) return { text: '', voice: false };
  if (last.deleted_at) return { text: 'Message supprimé', voice: false };
  if (last.type === 'voice') return { text: 'Message vocal', voice: true };
  if (last.type === 'image') return { text: 'Photo', voice: false };
  if (last.type === 'video') return { text: 'Vidéo', voice: false };
  if (last.type === 'file') return { text: 'Fichier', voice: false };
  return { text: last.content || '', voice: false };
}
async function loadChats() {
  if (!me || !db) return;
  if (!$('chats')) return;
  const { data: memberships, error } = await db
    .from('conversation_members')
    .select('conversation_id, role')
    .eq('user_id', me.id)
    .limit(100);
  if (error) {
    if (isNetworkError(error)) {
      chatRows = cacheGet('chats') || [];
      renderChatList();
      return;
    }
    throw error;
  }
  const rows = await Promise.all((memberships || []).map(async membership => {
    const id = membership.conversation_id;
    const { data: conversation, error: conversationError } = await db
      .from('conversations')
      .select('id, title, is_group, created_at, last_message_at')
      .eq('id', id)
      .maybeSingle();
    if (conversationError) {
      console.warn(conversationError.message);
      return null;
    }
    if (!conversation) return null;
    let name = conversation.title ||
      (conversation.is_group ? 'Groupe' : 'Conversation privée');
    let otherId = null;
    let avatarUrl = null;
    if (!conversation.is_group) {
      try {
        const { data: others } = await db
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', id)
          .neq('user_id', me.id)
          .limit(1);
        otherId = others?.[0]?.user_id || null;
        if (otherId) {
          const { data: other } = await db
            .from('profiles')
            .select('full_name, username, avatar_url')
            .eq('id', otherId)
            .maybeSingle();
          if (other) {
            name = other.full_name || other.username || name;
            avatarUrl = other.avatar_url || null;
          }
        }
      } catch (lookupError) {
        console.warn(lookupError);
      }
    }
    let last = null;
    try {
      const { data: latest } = await db
        .from('messages')
        .select(FEATURE.expiry
          ? 'content, type, sender_id, created_at, deleted_at, expires_at'
          : 'content, type, sender_id, created_at, deleted_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(FEATURE.expiry ? 10 : 1);
      last = (latest || []).find(item => !isExpired(item)) || null;
    } catch (lastError) {
      console.warn(lastError);
    }
    return {
      id,
      name,
      isGroup: Boolean(conversation.is_group),
      otherId,
      avatarUrl,
      last,
      time: last?.created_at || conversation.last_message_at || conversation.created_at
    };
  }));
  chatRows = rows
    .filter(Boolean)
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  chatRows.forEach(item => {
    if (prefs.lastRead[item.id] === undefined) prefs.lastRead[item.id] = Date.now();
  });
  savePrefs();
  cacheSet('chats', chatRows);
  renderChatList();
  prefetchMessages();
}
$('refresh')?.addEventListener('click', async () => {
  try {
    await loadProfile();
    await loadChats();
    await loadNotifications();
    notify('Actualisation terminée.');
  } catch (error) {
    errorMessage(error);
  }
});
/* ---------- Nouvelle discussion (feuille du bouton +) ---------- */
let ncPeople = [];
let ncMode = 'chat';
let ncAddTo = null;   // identifiant du groupe quand on ajoute des participants
let ncPhoneResults = [];
let ncPhoneTimer = null;
const ncSelected = new Set();
function ncLetter(name) {
  const first = String(name || '').trim().normalize('NFD')
    .replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}
function ncItem(person, opts = {}) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'nc-item';
  const avatar = document.createElement('span');
  avatar.className = 'avatar';
  const label = opts.label || person.full_name || person.username || 'Utilisateur';
  setAvatar(avatar, person.avatar_url, label);
  const text = document.createElement('span');
  text.className = 'nc-text';
  const title = document.createElement('b');
  title.textContent = label;
  text.append(title);
  const sub = opts.sub || '';
  if (sub) {
    const small = document.createElement('small');
    small.textContent = sub;
    text.append(small);
  }
  row.append(avatar, text);
  if (ncMode === 'group' && !opts.self) {
    const box = document.createElement('i');
    box.className = 'nc-check' + (ncSelected.has(person.id) ? ' on' : '');
    row.append(box);
  }
  row.addEventListener('click', () => {
    if (ncMode === 'group') {
      if (opts.self) return;
      if (ncSelected.has(person.id)) ncSelected.delete(person.id);
      else ncSelected.add(person.id);
      ncRender();
      return;
    }
    closeNewChat();
    if (opts.addContact) addContact(person.id);
    startPrivateChat(person.id);
  });
  return row;
}
function ncGroupCard(items) {
  const card = document.createElement('div');
  card.className = 'nc-group';
  items.forEach(item => card.append(item));
  return card;
}
function ncRender() {
  const body = $('ncBody');
  if (!body) return;
  body.replaceChildren();
  const rawQuery = $('ncSearch').value.trim();
  const phoneMode = isPhoneQuery(rawQuery);
  const query = rawQuery.toLowerCase();
  const matches = person => !query ||
    (person.full_name || '').toLowerCase().includes(query);
  $('ncActions').hidden = ncMode === 'group' || Boolean(query);
  const known = ncPeople.filter(matches);
  const extra = ncPhoneResults.filter(person => !known.some(item => item.id === person.id));
  const extraIds = new Set(extra.map(person => person.id));
  const people = phoneMode ? ncPhoneResults : [...known, ...extra];
  const addTitle = text => {
    const title = document.createElement('h4');
    title.className = 'nc-title';
    title.textContent = text;
    body.append(title);
  };
  if (!query) {
    const frequent = chatRows
      .filter(row => !row.isGroup && row.otherId)
      .map(row => ncPeople.find(person => person.id === row.otherId))
      .filter(Boolean)
      .slice(0, 5);
    if (frequent.length) {
      addTitle('Contacts fréquents');
      body.append(ncGroupCard(frequent.map(person => ncItem(person))));
    }
    addTitle('Contacts sur TRUE CHAT');
    if (ncMode === 'chat') {
      const selfName = (profile?.full_name || profile?.username || 'Moi') + ' (Vous)';
      body.append(ncGroupCard([ncItem(
        { id: me.id, avatar_url: profile?.avatar_url },
        { label: selfName, sub: 'Envoyez-vous un message', self: false }
      )]));
    }
  } else {
    addTitle(
      phoneMode && phoneDigits(rawQuery).length < MIN_PHONE_DIGITS
        ? 'Entrez le numéro complet'
        : people.length ? 'Résultats' : 'Aucun résultat (numéro complet ou nom d’utilisateur exact)'
    );
  }
  const sections = new Map();
  people.forEach(person => {
    const letter = ncLetter(person.full_name || person.username);
    if (!sections.has(letter)) sections.set(letter, []);
    sections.get(letter).push(person);
  });
  [...sections.keys()].sort((a, b) =>
    a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)
  ).forEach(letter => {
    if (!query) {
      const title = document.createElement('h4');
      title.className = 'nc-title letter';
      title.dataset.letter = letter;
      title.textContent = letter;
      body.append(title);
    }
    body.append(ncGroupCard(
      sections.get(letter).map(person => ncItem(person, (phoneMode || extraIds.has(person.id))
        ? { sub: person.phone ? formatPhone(person.phone) : '@' + person.username, addContact: true }
        : {}))
    ));
  });
  if (!query) {
    body.append(scopeNote('Pour trouver une personne, entrez son numéro complet ou son nom d’utilisateur exact.'));
  }
  if (ncMode === 'group') {
    const label = ncAddTo ? 'Ajouter' : 'Créer le groupe';
    $('ncGroupGo').textContent = ncSelected.size ? label + ' (' + ncSelected.size + ')' : label;
  }
}
function ncBuildAlpha() {
  const alpha = $('ncAlpha');
  alpha.replaceChildren();
  [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'].forEach(letter => {
    const key = document.createElement('button');
    key.type = 'button';
    key.textContent = letter;
    key.addEventListener('click', () => {
      const target = $('ncBody').querySelector('[data-letter="' + letter + '"]');
      if (target) target.scrollIntoView({ block: 'start' });
    });
    alpha.append(key);
  });
}
async function openNewChat(mode = 'chat', addTo = null) {
  if (!me || !db) return;
  ncMode = mode;
  ncAddTo = addTo;
  ncSelected.clear();
  ncPhoneResults = [];
  $('ncTitle').textContent = addTo ? 'Ajouter des participants'
    : mode === 'group' ? 'Nouveau groupe' : 'Nouvelle discussion';
  $('ncGroupName').hidden = Boolean(addTo);
  $('ncGroupBar').hidden = mode !== 'group';
  $('ncGroupName').value = '';
  $('ncSearch').value = '';
  $('ncAlpha').hidden = false;
  ncBuildAlpha();
  $('newChat').hidden = false;
  document.body.style.overflow = 'hidden';
  $('ncBody').textContent = 'Chargement…';
  try {
    ncPeople = await loadKnownPeople();
    if (addTo) {
      const { data: current, error: currentError } = await db
        .from('conversation_members').select('user_id').eq('conversation_id', addTo);
      if (currentError) throw currentError;
      const already = new Set((current || []).map(item => item.user_id));
      ncPeople = ncPeople.filter(person => !already.has(person.id));
    }
    ncRender();
  } catch (error) {
    $('ncBody').textContent = '';
    errorMessage(error);
  }
}
function closeNewChat() {
  $('newChat').hidden = true;
  document.body.style.overflow = '';
}
$('newConversation')?.addEventListener('click', () => openNewChat('chat'));
$('newGroup')?.addEventListener('click', () => openNewChat('group'));
$('ncClose')?.addEventListener('click', closeNewChat);
$('newChat')?.addEventListener('click', event => {
  if (event.target === $('newChat')) closeNewChat();
});
$('ncSearch')?.addEventListener('input', () => {
  clearTimeout(ncPhoneTimer);
  const raw = $('ncSearch').value;
  const typed = raw.trim().replace(/^@/, '');
  const phoneQuery = isPhoneQuery(raw) && phoneDigits(raw).length >= MIN_PHONE_DIGITS;
  const nameQuery = !isPhoneQuery(raw) && USERNAME_RE.test(typed);
  ncPhoneResults = [];
  ncRender();
  if (!phoneQuery && !nameQuery) return;
  ncPhoneTimer = setTimeout(async () => {
    try {
      ncPhoneResults = await findProfiles(raw);
    } catch (error) {
      ncPhoneResults = [];
      console.warn('Recherche de contact:', error.message || error);
    }
    if ($('ncSearch').value === raw) ncRender();
  }, 350);
});
$('ncGroup')?.addEventListener('click', () => openNewChat('group'));
$('ncContact')?.addEventListener('click', () => {
  const input = $('ncSearch');
  if (!input) return;
  input.value = '';
  input.inputMode = 'tel';
  ncRender();
  notify('Choisissez le pays à droite, puis entrez le numéro : l’indicatif s’ajoute tout seul.');
  input.focus();
});
$('ncCommunity')?.addEventListener('click', () => notify('Bientôt disponible.'));
$('ncBroadcast')?.addEventListener('click', () => notify('Bientôt disponible.'));
$('ncGroupBar')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (ncAddTo) {
    if (!ncSelected.size) {
      notify('Choisissez au moins une personne.');
      return;
    }
    const target = ncAddTo;
    const addButton = $('ncGroupGo');
    setBusy(addButton, true, 'Ajout...');
    try {
      const { error } = await db.rpc('add_group_members', {
        group_id: target,
        member_ids: [...ncSelected]
      });
      if (error) throw error;
      closeNewChat();
      notify('Participants ajoutés.');
      openGroupInfo(target, $('roomTitle')?.textContent);
    } catch (error) {
      groupRpcError(error);
    } finally {
      setBusy(addButton, false);
    }
    return;
  }
  const title = $('ncGroupName').value.trim();
  if (!title) {
    notify('Entrez le nom du groupe.');
    return;
  }
  if (!ncSelected.size) {
    notify('Choisissez au moins une personne.');
    return;
  }
  const button = $('ncGroupGo');
  setBusy(button, true, 'Création...');
  try {
    const { data, error } = await db.rpc('create_group', {
      group_title: title,
      member_ids: [...ncSelected]
    });
    if (error) throw error;
    closeNewChat();
    await loadChats();
    await openRoom(data);
  } catch (error) {
    errorMessage(error);
  } finally {
    setBusy(button, false);
  }
});
/* =====================================================
   OUVRIR UNE CONVERSATION ET CHARGER LES MESSAGES
===================================================== */
async function openRoom(id) {
  if (isRoomLocked(id) && !sessionUnlocked.has(id)) {
    if (!(await verifyPin('Discussion verrouillée'))) return;
    sessionUnlocked.add(id);
  }
  room = id;
  prefs.lastRead[id] = Date.now();
  delete prefs.unread[id];
  savePrefs();
  $show('home', false);
  $show('room', true);
  const { data, error } = await db
    .from('conversations')
    .select(FEATURE.convExpiry ? 'id, title, is_group, ephemeral_seconds' : 'id, title, is_group')
    .eq('id', id)
    .maybeSingle();
  if (error && !isNetworkError(error)) {
    errorMessage(error);
    return;
  }
  if (data && FEATURE.convExpiry) roomMeta[id] = { ephemeral_seconds: data.ephemeral_seconds };
  applyRoomLook();
  const cached = chatRows.find(row => row.id === id);
  roomOtherId = cached?.isGroup ? null : (cached?.otherId || null);
  if (!cached && data && !data.is_group) {
    try {
      const { data: others } = await db
        .from('conversation_members')
        .select('user_id')
        .eq('conversation_id', id)
        .neq('user_id', me.id)
        .limit(1);
      roomOtherId = others?.[0]?.user_id || null;
    } catch (error) {
      roomOtherId = null;
    }
  }
  const roomName = cached?.name ||
    data?.title || (data?.is_group ? 'Groupe' : 'Conversation privée');
  $('roomTitle').textContent = roomName;
  if ($('roomAvatar')) {
    setAvatar($('roomAvatar'), cached?.avatarUrl, roomName);
  }
  try {
    await loadMessages();
    subscribeToMessages();
  } catch (messageError) {
    errorMessage(messageError);
  }
}
$('back')?.addEventListener('click', async () => {
  cancelVoiceRecording();
  if (room) {
    prefs.lastRead[room] = Date.now();
    savePrefs();
  }
  room = null;
  if (roomChannel && db) {
    await db.removeChannel(roomChannel);
    roomChannel = null;
  }
  $show('room', false);
  $show('home', true);
  await loadChats();
});
/* =====================================================
   MESSAGES
===================================================== */
async function loadMessages() {
  if (!room || !me) return;
  const box = $('messages');
  box.replaceChildren();
  const { data, error } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', room)
    .order('created_at', { ascending: false })
    .limit(150);
  let list = data ? [...data].reverse() : data;
  if (error) {
    if (!isNetworkError(error)) throw error;
    list = cacheGet('msgs.' + room) || [];
  } else {
    cacheSet('msgs.' + room, (list || []).slice(-150));
  }
  const clearedAt = prefs.clearedAt[room] || 0;
  for (const message of list || []) {
    if (isExpired(message)) continue;
    if (new Date(message.created_at).getTime() <= clearedAt) continue;
    await renderMessage(message, box);
  }
  await renderPendingForRoom();
  box.scrollTop = box.scrollHeight;
}
async function renderMessage(message, box) {
  if (message.id && box.querySelector('[data-id="' + message.id + '"]')) return;
  if (isExpired(message)) return;
  if (prefs.hidden?.[message.id]) return;
  const bubble = document.createElement('div');
  bubble.className =
    'bubble' + (message.sender_id === me.id ? ' mine' : '');
  if (message.id) bubble.dataset.id = message.id;
  box.append(bubble); // réservé tout de suite : évite les doublons et garde l'ordre
  attachMessageActions(message, bubble);
  scheduleExpiry(message, bubble);
  if (message.deleted_at) {
    bubble.textContent = 'Ce message a été supprimé.';
  } else {
    if (message.content) {
      const text = document.createElement('div');
      text.textContent = message.content;
      bubble.append(text);
    }
    if (message.media_path) {
      const bucket =
        message.type === 'image' ||
        message.type === 'video' ||
        message.type === 'voice' ||
        message.type === 'file'
          ? 'media'
          : null;
      if (bucket) {
        const signed = await signUrlOffline(bucket, message.media_path);
        const data = signed ? { signedUrl: signed } : null;
        const error = signed ? null : true;
        if (!error && data?.signedUrl) {
          if (message.type === 'image') {
            const img = document.createElement('img');
            img.src = data.signedUrl;
            img.alt = message.media_name || 'Image';
            img.loading = 'lazy';
            bubble.append(img);
            addSaveButton(bubble, data.signedUrl, message.media_name, 'image');
          } else if (message.type === 'video') {
            const video = document.createElement('video');
            video.src = data.signedUrl;
            video.controls = true;
            video.playsInline = true;
            bubble.append(video);
            addSaveButton(bubble, data.signedUrl, message.media_name, 'video');
          } else if (message.type === 'voice') {
            bubble.classList.add('voice-bubble');
            bubble.append(buildVoicePlayer(message, data.signedUrl));
          } else {
            const link = document.createElement('a');
            link.href = data.signedUrl;
            link.target = '_blank';
            link.rel = 'noopener';
            link.textContent =
              message.media_name || 'Ouvrir le fichier';
            bubble.append(link);
          }
        }
      }
    }
  }
  const time = document.createElement('small');
  time.textContent = message.created_at
    ? new Date(message.created_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';
  bubble.append(time);
}
function subscribeToMessages() {
  if (!room || !db) return;
  if (roomChannel) {
    db.removeChannel(roomChannel);
    roomChannel = null;
  }
  const subscribedRoom = room;
  roomChannel = db
    .channel('messages-' + subscribedRoom)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.' + subscribedRoom
      },
      async payload => {
        if (room !== subscribedRoom) return;
        cachePushMsg(subscribedRoom, payload.new);
        const box = $('messages');
        if (box && payload.new) {
          await renderMessage(payload.new, box);
          box.scrollTop = box.scrollHeight;
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: 'conversation_id=eq.' + subscribedRoom
      },
      payload => {
        if (room !== subscribedRoom || !payload.new?.deleted_at) return;
        const gone = $('messages')?.querySelector('[data-id="' + payload.new.id + '"]');
        if (gone) markBubbleDeleted(gone, { id: payload.new.id });
      }
    )
    .subscribe();
}

/* =====================================================
   LECTEUR DE MESSAGE VOCAL (façon WhatsApp)
   - forme d'onde réelle (décodée), point de progression, appui pour avancer
   - micro vert = pas encore écouté, bleu = écouté
   - vitesse 1× / 1.5× / 2× pendant la lecture
===================================================== */
const VOICE_BARS = 40;
const SVG_PLAY = '<svg class="i-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
const SVG_PAUSE = '<svg class="i-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.2"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2"/></svg>';
const voiceState = { ctx: null, queue: Promise.resolve(), current: null, senders: new Map() };
const voicePlayedKey = 'truechat.voicePlayed';
function loadVoicePlayed() {
  try { return new Set(JSON.parse(localStorage.getItem(voicePlayedKey) || '[]')); }
  catch (error) { return new Set(); }
}
const voicePlayed = loadVoicePlayed();
function markVoicePlayed(id) {
  if (!id || voicePlayed.has(id)) return;
  voicePlayed.add(id);
  try { localStorage.setItem(voicePlayedKey, JSON.stringify([...voicePlayed].slice(-800))); } catch (error) {}
}
function voiceClock(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}
// Onde de secours (avant le décodage) : stable pour un même message
function voiceFakeBars(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const out = [];
  let prev = .5;
  for (let i = 0; i < VOICE_BARS; i++) {
    prev = prev * .45 + rnd() * .55;
    out.push(Math.max(.16, Math.min(1, prev * 1.25)));
  }
  return out;
}
// Décode le fichier audio pour en tirer la vraie onde et la durée
function decodeVoice(url) {
  const job = voiceState.queue.then(async () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) throw new Error('AudioContext indisponible');
    voiceState.ctx = voiceState.ctx || new Ctx();
    const response = await fetch(url);
    if (!response.ok) throw new Error('Téléchargement impossible');
    const data = await response.arrayBuffer();
    const buffer = await new Promise((resolve, reject) => {
      const p = voiceState.ctx.decodeAudioData(data, resolve, reject);
      if (p && p.catch) p.catch(reject);
    });
    const channel = buffer.getChannelData(0);
    const size = Math.max(1, Math.floor(channel.length / VOICE_BARS));
    const bars = [];
    for (let i = 0; i < VOICE_BARS; i++) {
      let sum = 0;
      const start = i * size;
      const end = Math.min(channel.length, start + size);
      const step = Math.max(1, Math.floor((end - start) / 400));
      let n = 0;
      for (let j = start; j < end; j += step) { sum += channel[j] * channel[j]; n++; }
      bars.push(Math.sqrt(sum / Math.max(1, n)));
    }
    const peak = Math.max(...bars, 0.0001);
    return {
      duration: buffer.duration,
      bars: bars.map(v => Math.max(.14, Math.min(1, Math.pow(v / peak, .7))))
    };
  });
  voiceState.queue = job.catch(() => {});
  return job;
}
function voiceSender(id) {
  if (!id) return Promise.resolve(null);
  if (!voiceState.senders.has(id)) {
    voiceState.senders.set(id, (async () => {
      try {
        const { data } = await db.from('profiles')
          .select('id, username, full_name, avatar_url').eq('id', id).maybeSingle();
        return data || null;
      } catch (error) { return null; }
    })());
  }
  return voiceState.senders.get(id);
}
function buildVoicePlayer(message, url) {
  const mine = message.sender_id === me?.id;
  const wrap = document.createElement('div');
  wrap.className = 'vm' + (mine ? ' mine' : '') + (!mine && !voicePlayed.has(message.id) ? ' new' : '');

  const who = document.createElement('span');
  who.className = 'vm-who';
  const avatar = document.createElement('span');
  avatar.className = 'avatar vm-av';
  const mic = document.createElement('span');
  mic.className = 'vm-mic';
  mic.innerHTML = ICON_MIC;
  who.append(avatar, mic);
  if (mine) {
    setAvatar(avatar, profile?.avatar_url, profile?.full_name || profile?.username || 'Moi');
  } else {
    setAvatar(avatar, null, '?');
    voiceSender(message.sender_id).then(person => {
      if (person) setAvatar(avatar, person.avatar_url, person.full_name || person.username || '?');
    });
  }

  const play = document.createElement('button');
  play.type = 'button';
  play.className = 'vm-play';
  play.setAttribute('aria-label', 'Lire le message vocal');
  play.innerHTML = SVG_PLAY + SVG_PAUSE;

  const main = document.createElement('div');
  main.className = 'vm-main';
  const track = document.createElement('div');
  track.className = 'vm-track';
  const bars = voiceFakeBars(message.id || url).map(value => {
    const bar = document.createElement('i');
    bar.style.height = Math.round(value * 100) + '%';
    track.append(bar);
    return bar;
  });
  const dot = document.createElement('span');
  dot.className = 'vm-dot';
  track.append(dot);
  const label = document.createElement('div');
  label.className = 'vm-dur';
  label.textContent = '0:00';
  main.append(track, label);

  const speed = document.createElement('button');
  speed.type = 'button';
  speed.className = 'vm-speed';
  speed.textContent = '1×';

  wrap.append(who, play, main, speed);

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.src = url;
  audio.setAttribute('playsinline', '');
  let total = 0;
  let raf = 0;
  const rates = [1, 1.5, 2];
  let rateIndex = 0;

  const duration = () => total || (Number.isFinite(audio.duration) ? audio.duration : 0);
  const paint = () => {
    const d = duration();
    const p = d ? Math.min(1, audio.currentTime / d) : 0;
    const lit = Math.round(p * bars.length);
    bars.forEach((bar, i) => bar.classList.toggle('on', i < lit));
    dot.style.left = 'calc(' + (p * 100) + '% - ' + (p * 14) + 'px)';
    label.textContent = voiceClock(audio.currentTime > 0.05 ? audio.currentTime : d);
  };
  const loop = () => {
    paint();
    if (!audio.paused) raf = requestAnimationFrame(loop);
  };
  const control = { pause: () => audio.pause() };

  audio.addEventListener('loadedmetadata', paint);
  audio.addEventListener('durationchange', paint);
  audio.addEventListener('play', () => {
    wrap.classList.add('playing');
    play.setAttribute('aria-label', 'Mettre en pause');
    voiceState.current = control;
    if (!mine) {
      markVoicePlayed(message.id);
      wrap.classList.remove('new');
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  });
  audio.addEventListener('pause', () => {
    wrap.classList.remove('playing');
    play.setAttribute('aria-label', 'Lire le message vocal');
    paint();
  });
  audio.addEventListener('ended', () => {
    audio.currentTime = 0;
    wrap.classList.remove('playing');
    paint();
  });
  play.addEventListener('click', async () => {
    if (!audio.paused) { audio.pause(); return; }
    if (voiceState.current && voiceState.current !== control) voiceState.current.pause();
    try {
      audio.playbackRate = rates[rateIndex];
      await audio.play();
    } catch (error) {
      notify('Ntibishoboye gucurura iri jwi.');
    }
  });
  speed.addEventListener('click', () => {
    rateIndex = (rateIndex + 1) % rates.length;
    audio.playbackRate = rates[rateIndex];
    speed.textContent = (rates[rateIndex] === 1.5 ? '1.5' : rates[rateIndex]) + '×';
  });

  // appui / glissement sur l'onde pour avancer ou reculer
  let seeking = false;
  const seekTo = event => {
    const d = duration();
    if (!d) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * d;
    paint();
  };
  track.addEventListener('pointerdown', event => {
    seeking = true;
    try { track.setPointerCapture(event.pointerId); } catch (error) {}
    seekTo(event);
  });
  track.addEventListener('pointermove', event => { if (seeking) seekTo(event); });
  ['pointerup', 'pointercancel'].forEach(name =>
    track.addEventListener(name, () => { seeking = false; }));

  // vraie onde + durée exacte (les petits vocaux seulement)
  label.textContent = voiceClock(0);
  if (!message.media_size || message.media_size < 4 * 1024 * 1024) {
    decodeVoice(url).then(result => {
      total = result.duration;
      result.bars.forEach((value, i) => { if (bars[i]) bars[i].style.height = Math.round(value * 100) + '%'; });
      paint();
    }).catch(() => {});
  }
  return wrap;
}

/* =====================================================
   PROFIL D'UN CONTACT / INFOS DU GROUPE (touchez la photo ou le nom)
===================================================== */
let roomOtherId = null;
function closePhoto() {
  $('photoView')?.remove();
}
function showPhoto(url, label) {
  closePhoto();
  const view = document.createElement('div');
  view.id = 'photoView';
  const img = document.createElement('img');
  img.src = url;
  img.alt = label || 'Photo de profil';
  img.draggable = false;
  const caption = document.createElement('p');
  caption.textContent = label || '';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'pv-x';
  close.setAttribute('aria-label', 'Fermer');
  close.textContent = '✕';
  view.append(img, caption, close);
  view.addEventListener('click', closePhoto);
  document.body.append(view);
}
async function openContactProfile(userId) {
  if (!userId) return;
  return openInfoPage({ userId, convId: room && roomOtherId === userId ? room : null });
}
async function openGroupInfo(conversationId, title) {
  if (!conversationId) return;
  return openInfoPage({ group: true, convId: conversationId, title });
}
function groupRpcError(error) {
  const text = String(error?.message || error);
  if (/could not find the function|schema cache/i.test(text)) {
    notify('Fonction manquante : exécutez SETUP-push-groupes.sql dans Supabase (SQL Editor).');
  } else {
    errorMessage(error);
  }
}
async function renameGroup(conversationId, current) {
  const name = (prompt('Nouveau nom du groupe', current || '') || '').trim();
  if (!name || name === current) return;
  try {
    const { error } = await db.rpc('rename_group', { group_id: conversationId, new_title: name });
    if (error) throw error;
    if (room === conversationId && $('roomTitle')) $('roomTitle').textContent = name;
    closeSheet();
    notify('Groupe renommé.');
    await loadChats();
  } catch (error) {
    groupRpcError(error);
  }
}
async function leaveGroup(conversationId) {
  if (!(await glassConfirm('Vous ne recevrez plus ses messages.', 'Quitter', 'Quitter ce groupe ?'))) return;
  try {
    const { error } = await db.rpc('leave_group', { group_id: conversationId });
    if (error) throw error;
    closeSheet();
    if (room === conversationId) $('back')?.click();
    await loadChats();
    notify('Vous avez quitté le groupe.');
  } catch (error) {
    groupRpcError(error);
  }
}
async function openRoomProfile() {
  if (!room) return;
  if (roomOtherId) openContactProfile(roomOtherId);
  else openGroupInfo(room, $('roomTitle')?.textContent);
}
$('roomAvatar')?.addEventListener('click', openRoomProfile);
document.querySelector('.room-bar .room-title')?.addEventListener('click', openRoomProfile);
/* =====================================================
   ENVOI DE MESSAGES ET DE MÉDIAS
===================================================== */
$('attachment')?.addEventListener('change', () => {
  selectedMedia = $('attachment').files?.[0] || null;
  const label = $('selectedFile');
  if (label) {
    label.textContent = selectedMedia
      ? selectedMedia.name + ' — prêt à être envoyé avec votre message'
      : '';
  }
});
$('sendForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!room || !me) {
    notify('Ouvrez une conversation avant d’envoyer un message.');
    return;
  }
  const text = $('messageText').value.trim();
  const file = selectedMedia;
  const button = $('sendForm').querySelector('button[type="submit"]');
  if (!text && !file) {
    startVoiceRecording();
    return;
  }
  if (file && file.size > 25 * 1024 * 1024) {
    notify('Le fichier dépasse la limite de 25 Mo.');
    return;
  }
  let type = 'text';
  let extension = 'bin';
  if (file) {
    extension = file.name.includes('.') ? file.name.split('.').pop().toLowerCase() : 'bin';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'voice';
    else type = 'file';
  }
  const job = {
    room,
    type,
    content: text,
    blob: file || null,
    mime: file?.type,
    ext: extension,
    mediaName: file?.name || null
  };
  // Affichage immédiat : le champ se vide et la bulle apparaît tout de suite
  const temp = pendingBubble(job);
  const tempNote = temp.querySelector('small');
  if (tempNote) tempNote.textContent = '⏳ envoi…';
  $('messageText').value = '';
  $('attachment').value = '';
  $('selectedFile').textContent = '';
  selectedMedia = null;
  if ($('cameraInput')) $('cameraInput').value = '';
  updateComposerMode();
  const box = $('messages');
  box.append(temp);
  box.scrollTop = box.scrollHeight;
  sendJob(job, temp)
    .then(async status => {
      if (status !== 'sent') return;
      temp.remove();
      if (room !== job.room) return;
      if (job.sentRow) {
        cachePushMsg(job.room, job.sentRow);
        await renderMessage(job.sentRow, $('messages'));
        $('messages').scrollTop = $('messages').scrollHeight;
      } else {
        await loadMessages();
      }
    })
    .catch(error => {
      temp.remove();
      if (!file && !$('messageText').value) {
        $('messageText').value = text;
        updateComposerMode();
      }
      errorMessage(error);
    });
});
/* =====================================================
   COMPOSER : MICRO / ENVOI + MESSAGES VOCAUX (MediaRecorder)
===================================================== */
const MAX_VOICE_SECONDS = 600;
const voice = {
  active: false, recorder: null, stream: null, chunks: [],
  startedAt: 0, timer: null, send: false, room: null,
  ctx: null, analyser: null, levels: [], wave: null
};
// Onde en direct (barres qui défilent vers la gauche, comme WhatsApp)
function startVoiceWave(stream) {
  voice.levels = [];
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) {
      voice.ctx = new Ctx();
      if (voice.ctx.state === 'suspended') voice.ctx.resume().catch(() => {});
      const source = voice.ctx.createMediaStreamSource(stream);
      voice.analyser = voice.ctx.createAnalyser();
      voice.analyser.fftSize = 512;
      source.connect(voice.analyser);
    }
  } catch (error) {
    voice.analyser = null;
  }
  const canvas = $('voiceWave');
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 160;
  const height = canvas.clientHeight || 36;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const g = canvas.getContext('2d');
  const data = voice.analyser ? new Uint8Array(voice.analyser.fftSize) : null;
  clearInterval(voice.wave);
  voice.wave = setInterval(() => {
    let level = 0;
    if (data) {
      voice.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v; }
      level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
    } else {
      level = .15 + Math.random() * .35;
    }
    voice.levels.push(Math.max(.08, level));
    const step = 5 * ratio;
    const max = Math.floor(canvas.width / step);
    if (voice.levels.length > max) voice.levels.splice(0, voice.levels.length - max);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = 'rgba(255,255,255,.9)';
    const start = canvas.width - voice.levels.length * step;
    voice.levels.forEach((value, i) => {
      const barHeight = Math.max(3 * ratio, value * canvas.height * .9);
      const x = start + i * step;
      const y = (canvas.height - barHeight) / 2;
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, 3 * ratio, barHeight, 2 * ratio); else g.rect(x, y, 3 * ratio, barHeight);
      g.fill();
    });
  }, 60);
}
function stopVoiceWave() {
  clearInterval(voice.wave);
  voice.wave = null;
  voice.levels = [];
  try { voice.ctx?.close(); } catch (error) {}
  voice.ctx = null;
  voice.analyser = null;
}
const setText = (id, text) => {
  const el = $(id);
  if (el) el.textContent = text;
};
const formatClock = seconds =>
  Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

// Le bouton rond affiche un micro quand il n'y a rien à envoyer, sinon « envoyer »
function updateComposerMode() {
  const form = $('sendForm');
  if (!form) return;
  const hasContent = Boolean($('messageText')?.value.trim()) || Boolean(selectedMedia);
  form.classList.toggle('has-content', hasContent);
  $('sendBtn')?.setAttribute(
    'aria-label',
    hasContent ? 'Envoyer' : 'Enregistrer un message vocal'
  );
}
$('messageText')?.addEventListener('input', updateComposerMode);
$('attachment')?.addEventListener('change', updateComposerMode);
$('cameraInput')?.addEventListener('change', () => {
  selectedMedia = $('cameraInput').files?.[0] || null;
  setText('selectedFile', selectedMedia
    ? selectedMedia.name + ' — prêt à être envoyé avec votre message'
    : '');
  updateComposerMode();
});

// iPhone/Safari enregistre en MP4 (AAC) ; on le préfère car il se lit partout.
function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
  ].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

// Appelée directement depuis un geste de l'utilisateur (requis par iOS)
async function startVoiceRecording() {
  if (voice.active) return;
  if (!room || !me) {
    notify('Ouvrez une conversation avant d’enregistrer un message vocal.');
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    notify("Iki gikoresho ntikibasha gufata amajwi.");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    console.error('Micro:', error);
    notify("Ntibyashoboka kubona uruhusha rwa microphone.");
    return;
  }
  try {
    const mime = pickAudioMime();
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    voice.stream = stream;
    voice.recorder = recorder;
    voice.chunks = [];
    voice.send = false;
    voice.room = room;
    voice.startedAt = Date.now();
    voice.active = true;
    recorder.ondataavailable = event => {
      if (event.data && event.data.size) voice.chunks.push(event.data);
    };
    recorder.onstop = () => handleVoiceStop(recorder);
    recorder.start(1000);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    voice.active = false;
    errorMessage(error);
    return;
  }
  $show('sendForm', false);
  $show('voiceBar', true);
  setText('voiceTime', '0:00');
  startVoiceWave(stream);
  voice.timer = setInterval(() => {
    const seconds = Math.floor((Date.now() - voice.startedAt) / 1000);
    setText('voiceTime', formatClock(seconds));
    if (seconds >= MAX_VOICE_SECONDS) stopVoiceRecording(true);
  }, 250);
}

function stopVoiceRecording(send) {
  if (!voice.active || !voice.recorder) return;
  voice.send = Boolean(send);
  clearInterval(voice.timer);
  voice.timer = null;
  if (voice.recorder.state !== 'inactive') voice.recorder.stop();
  else handleVoiceStop(voice.recorder);
}
function cancelVoiceRecording() {
  stopVoiceRecording(false);
}

async function handleVoiceStop(recorder) {
  const { send, chunks, startedAt, room: voiceRoom, stream } = voice;
  stream?.getTracks().forEach(track => track.stop());
  voice.active = false;
  voice.recorder = null;
  voice.stream = null;
  voice.chunks = [];
  stopVoiceWave();
  $show('voiceBar', false);
  $show('sendForm', true);
  if (!send || !me || !voiceRoom) return;

  if ((Date.now() - startedAt) / 1000 < 1 || !chunks.length) {
    notify('Message vocal trop court.');
    return;
  }
  const mime = (recorder.mimeType || 'audio/webm').split(';')[0];
  const extension = mime.includes('mp4') ? 'm4a'
    : mime.includes('ogg') ? 'ogg'
    : mime.includes('mpeg') ? 'mp3'
    : 'webm';
  const blob = new Blob(chunks, { type: mime });
  if (blob.size > 25 * 1024 * 1024) {
    notify('Le message vocal dépasse la limite de 25 Mo.');
    return;
  }
  try {
    await sendJob({
      room: voiceRoom,
      type: 'voice',
      content: null,
      blob,
      mime,
      ext: extension,
      mediaName: 'Message vocal'
    });
    if (room === voiceRoom) await loadMessages();
  } catch (error) {
    errorMessage(error);
  }
}

$('voiceCancel')?.addEventListener('click', () => stopVoiceRecording(false));
$('voiceSend')?.addEventListener('click', () => stopVoiceRecording(true));
/* =====================================================
   STATUTS : TEXTE, IMAGE OU VIDÉO
===================================================== */
$('statusForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!me) return;
  const content = $('statusText').value.trim();
  const file = $('statusMedia').files?.[0] || null;
  if (!content && !file) {
    notify('Écrivez un statut ou choisissez une photo/vidéo.');
    return;
  }
  if (file && file.size > 25 * 1024 * 1024) {
    notify('Le fichier dépasse la limite de 25 Mo.');
    return;
  }
  try {
    let type = 'text';
    let mediaPath = null;
    if (file) {
      type = file.type.startsWith('image/') ? 'image' : 'video';
      if (!file.type.startsWith('image/') &&
          !file.type.startsWith('video/')) {
        throw new Error('Les statuts acceptent les images et les vidéos.');
      }
      const extension = file.name.includes('.')
        ? file.name.split('.').pop().toLowerCase()
        : 'bin';
      mediaPath = me.id + '/' + crypto.randomUUID() + '.' + extension;
      const { error: uploadError } = await db.storage
        .from('statuses')
        .upload(mediaPath, file, {
          contentType: file.type,
          upsert: false
        });
      if (uploadError) throw uploadError;
    }
    const { error } = await db
      .from('statuses')
      .insert({
        user_id: me.id,
        type,
        content: content || null,
        media_path: mediaPath,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
    if (error) {
      if (mediaPath) {
        await db.storage.from('statuses').remove([mediaPath]);
      }
      throw error;
    }
    closeStatusComposer();
    await loadStatuses();
    notify('Statut publié. Il expire après 24 heures.');
  } catch (error) {
    errorMessage(error);
  }
});
/* ---------- Lecteur et cartes de statuts (style WhatsApp) ---------- */
const VIEWED_KEY = 'truechat_viewed_statuses';
function viewedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'));
  } catch (error) {
    return new Set();
  }
}
function markViewed(id) {
  try {
    const set = viewedSet();
    set.add(id);
    localStorage.setItem(VIEWED_KEY, JSON.stringify([...set].slice(-500)));
  } catch (error) {
    /* stockage indisponible : on ignore */
  }
}
const signedCache = new Map();
async function statusUrl(path) {
  if (!path || !db) return null;
  const cached = signedCache.get(path);
  if (cached && cached.exp > Date.now()) return cached.url;
  const url = await signUrlOffline('statuses', path);
  if (!url) return null;
  signedCache.set(path, { url, exp: Date.now() + 3300000 });
  return url;
}
let statusGroups = [];
let statusOrder = [];
let statusFilter = '';
function groupUnviewed(group) {
  const seen = viewedSet();
  return group.items.some(item => !seen.has(item.id));
}
function statusTimeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hour = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay ? "Aujourd'hui, " + hour : 'Hier, ' + hour;
}
async function loadStatuses() {
  if (!me || !db) return;
  if (!$('statusStrip')) return;
  let data;
  const names = new Map();
  try {
    const result = await db
      .from('statuses')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(300);
    if (result.error) throw result.error;
    data = result.data;
    const ids = [...new Set((data || []).map(item => item.user_id))];
    if (ids.length) {
      const { data: people } = await db
        .from('profiles')
        .select('id, full_name, username')
        .in('id', ids);
      (people || []).forEach(person => {
        names.set(person.id, person.full_name || person.username || 'Utilisateur');
      });
    }
    cacheSet('statuses', { data, names: [...names.entries()] });
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const saved = cacheGet('statuses');
    if (!saved) return;
    const now = Date.now();
    data = (saved.data || []).filter(item => !item.expires_at || new Date(item.expires_at).getTime() > now);
    (saved.names || []).forEach(([id, name]) => names.set(id, name));
  }
  const byUser = new Map();
  (data || []).forEach(item => {
    if (!byUser.has(item.user_id)) byUser.set(item.user_id, []);
    byUser.get(item.user_id).push(item);
  });
  statusGroups = [...byUser.entries()].map(([userId, items]) => ({
    userId,
    items,
    isMe: userId === me.id,
    name: userId === me.id
      ? 'Mon statut'
      : (names.get(userId) || 'Utilisateur')
  }));
  renderStatusStrip();
}
function statusCard(group, own) {
  const card = document.createElement('div');
  card.className = 'status-card' + (own && !group.items.length ? ' add' : '');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const last = group.items[group.items.length - 1];
  const bg = document.createElement('div');
  bg.className = 'sc-bg';
  if (last) {
    if (last.type === 'image' && last.media_path) {
      statusUrl(last.media_path).then(url => {
        if (url) bg.style.backgroundImage = 'url("' + url + '")';
      }).catch(() => {});
    } else if (last.type === 'video') {
      bg.classList.add('video');
      bg.insertAdjacentHTML('beforeend',
        '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>');
    } else {
      bg.classList.add('text');
      bg.style.background = last.bg || avatarColor(group.userId + 'x');
      const snippet = document.createElement('span');
      snippet.textContent = last.content || '';
      bg.append(snippet);
    }
  }
  const ring = document.createElement('span');
  ring.className = 'sc-avatar' +
    (group.items.length && groupUnviewed(group) ? ' new' : '') +
    (group.items.length && !groupUnviewed(group) ? ' seen' : '');
  const inner = document.createElement('span');
  inner.className = 'avatar';
  const label = own ? (profile?.full_name || profile?.username || 'Moi') : group.name;
  inner.style.background = avatarColor(label);
  inner.textContent = initials(label);
  ring.append(inner);
  if (own) {
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.className = 'sc-plus';
    plus.setAttribute('aria-label', 'Ajouter un statut');
    plus.textContent = '+';
    plus.addEventListener('click', event => {
      event.stopPropagation();
      openStatusComposer();
    });
    ring.append(plus);
  }
  const name = document.createElement('span');
  name.className = 'sc-name';
  name.textContent = own
    ? (group.items.length ? 'Mon statut' : 'Ajouter un statut')
    : group.name;
  card.append(bg, ring, name);
  const open = () => {
    if (own && !group.items.length) openStatusComposer();
    else openStatusViewer(group);
  };
  card.addEventListener('click', open);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
  return card;
}
function renderStatusStrip() {
  const strip = $('statusStrip');
  if (!strip) return;
  strip.replaceChildren();
  const mine = statusGroups.find(group => group.isMe) ||
    { userId: me.id, name: 'Mon statut', isMe: true, items: [] };
  const query = statusFilter;
  let others = statusGroups.filter(group => !group.isMe);
  if (query) {
    others = others.filter(group => group.name.toLowerCase().includes(query));
  }
  others.sort((a, b) => {
    const diff = Number(groupUnviewed(b)) - Number(groupUnviewed(a));
    if (diff) return diff;
    return new Date(b.items[b.items.length - 1].created_at) -
      new Date(a.items[a.items.length - 1].created_at);
  });
  strip.append(statusCard(mine, true));
  others.forEach(group => strip.append(statusCard(group, false)));
  statusOrder = [...(mine.items.length ? [mine] : []), ...others];
  if ($('statusEmpty')) {
    $('statusEmpty').hidden = Boolean(others.length) || Boolean(query);
  }
}
/* ---------- Publier un statut ---------- */
let previewUrl = null;
function clearStatusPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('statusPreview')?.replaceChildren();
}
function openStatusComposer(focusText) {
  openStatusStart(focusText ? 'text' : undefined);
}
function closeStatusComposer() {
  $('statusComposer').hidden = true;
  $('statusText').value = '';
  $('statusMedia').value = '';
  clearStatusPreview();
}
$('statusCamera')?.addEventListener('click', () => openStatusStart());
$('statusPen')?.addEventListener('click', () => openStatusComposer(true));
$('statusCancel')?.addEventListener('click', closeStatusComposer);
$('statusComposer')?.addEventListener('click', event => {
  if (event.target === $('statusComposer')) closeStatusComposer();
});
$('statusMedia')?.addEventListener('change', () => {
  clearStatusPreview();
  const file = $('statusMedia').files?.[0];
  if (!file) return;
  previewUrl = URL.createObjectURL(file);
  const el = document.createElement(file.type.startsWith('video/') ? 'video' : 'img');
  el.src = previewUrl;
  if (el.tagName === 'VIDEO') {
    el.controls = true;
    el.muted = true;
    el.playsInline = true;
  }
  $('statusPreview').append(el);
  openStatusComposer();
});
$('statusFind')?.addEventListener('input', () => {
  statusFilter = $('statusFind').value.trim().toLowerCase();
  renderStatusStrip();
});
/* ---------- Lecteur plein écran ---------- */
const viewer = { g: 0, s: 0, token: 0, timer: null };
function stopViewerTimer() {
  clearTimeout(viewer.timer);
  viewer.timer = null;
  const video = $('vStage')?.querySelector('video');
  if (video) video.pause();
}
function openStatusViewer(group) {
  const index = statusOrder.indexOf(group);
  if (index < 0) return;
  viewer.g = index;
  const seen = viewedSet();
  const firstNew = group.items.findIndex(item => !seen.has(item.id));
  viewer.s = firstNew >= 0 ? firstNew : 0;
  $('statusViewer').hidden = false;
  document.body.style.overflow = 'hidden';
  showViewerStatus();
}
function closeStatusViewer() {
  stopViewerTimer();
  viewer.token += 1;
  $('statusViewer').hidden = true;
  $('vStage').replaceChildren();
  document.body.style.overflow = '';
  renderStatusStrip();
}
function viewerNext() {
  const group = statusOrder[viewer.g];
  if (viewer.s < group.items.length - 1) {
    viewer.s += 1;
  } else if (viewer.g < statusOrder.length - 1) {
    viewer.g += 1;
    viewer.s = 0;
  } else {
    closeStatusViewer();
    return;
  }
  showViewerStatus();
}
function viewerPrev() {
  if (viewer.s > 0) {
    viewer.s -= 1;
  } else if (viewer.g > 0) {
    viewer.g -= 1;
    viewer.s = 0;
  }
  showViewerStatus();
}
async function showViewerStatus() {
  stopViewerTimer();
  const token = ++viewer.token;
  const group = statusOrder[viewer.g];
  const item = group?.items[viewer.s];
  if (!item) {
    closeStatusViewer();
    return;
  }
  const label = group.isMe ? (profile?.full_name || 'Mon statut') : group.name;
  $('vName').textContent = group.isMe ? 'Mon statut' : label;
  $('vTime').textContent = statusTimeLabel(item.created_at);
  if ($('vDelete')) $('vDelete').hidden = !group.isMe;
  $('vAvatar').textContent = initials(label);
  $('vAvatar').style.background = avatarColor(label);
  const bars = $('vBars');
  bars.replaceChildren();
  const fills = group.items.map((_, i) => {
    const bar = document.createElement('div');
    bar.className = 'v-bar';
    const fill = document.createElement('i');
    fill.style.width = i < viewer.s ? '100%' : '0';
    bar.append(fill);
    bars.append(bar);
    return fill;
  });
  const current = fills[viewer.s];
  const stage = $('vStage');
  stage.replaceChildren();
  markViewed(item.id);
  const startTimer = ms => {
    current.style.transition = 'width ' + ms + 'ms linear';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      current.style.width = '100%';
    }));
    viewer.timer = setTimeout(viewerNext, ms);
  };
  const hasMedia = item.media_path && (item.type === 'image' || item.type === 'video');
  if (!hasMedia) {
    const box = document.createElement('div');
    box.className = 'v-text';
    box.style.background = item.bg || avatarColor(group.userId + 'x');
    box.textContent = item.content || '';
    stage.append(box);
    startTimer(5000);
    return;
  }
  const spinner = document.createElement('div');
  spinner.className = 'v-loading';
  spinner.textContent = 'Chargement…';
  stage.append(spinner);
  let url = null;
  try {
    url = await statusUrl(item.media_path);
  } catch (error) {
    console.warn(error);
  }
  if (token !== viewer.token) return;
  stage.replaceChildren();
  if (!url) {
    const box = document.createElement('div');
    box.className = 'v-loading';
    box.textContent = 'Média indisponible';
    stage.append(box);
    startTimer(3000);
    return;
  }
  if (item.type === 'image') {
    const img = document.createElement('img');
    img.alt = 'Statut';
    img.onload = () => {
      if (token === viewer.token) startTimer(5000);
    };
    img.onerror = () => {
      if (token === viewer.token) viewerNext();
    };
    img.src = url;
    stage.append(img);
  } else {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.playsInline = true;
    video.onended = () => {
      if (token === viewer.token) viewerNext();
    };
    video.ontimeupdate = () => {
      if (token === viewer.token && video.duration) {
        current.style.width = (video.currentTime / video.duration * 100) + '%';
      }
    };
    video.onerror = () => {
      if (token === viewer.token) viewerNext();
    };
    stage.append(video);
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
  }
  if (item.content) {
    const caption = document.createElement('div');
    caption.className = 'v-caption';
    caption.textContent = item.content;
    stage.append(caption);
  }
}
$('vNext')?.addEventListener('click', viewerNext);
$('vPrev')?.addEventListener('click', viewerPrev);
$('vClose')?.addEventListener('click', closeStatusViewer);
$('vDelete')?.addEventListener('click', async event => {
  event.stopPropagation();
  const group = statusOrder[viewer.g];
  const item = group?.items[viewer.s];
  if (!item || !group.isMe) return;
  stopViewerTimer();
  if (!(await glassConfirm('Ce statut sera supprimé.', 'Supprimer', 'Supprimer ce statut ?'))) {
    showViewerStatus();
    return;
  }
  try {
    const { data, error } = await db.from('statuses')
      .delete().eq('id', item.id).eq('user_id', me.id).select('id');
    if (error) throw error;
    if (!data?.length) {
      throw new Error('Suppression refusée par la base (règle RLS). Exécutez SUPPRESSION.sql dans Supabase (SQL Editor), puis réessayez.');
    }
    if (item.media_path) {
      const { error: fileError } = await db.storage.from('statuses').remove([item.media_path]);
      if (fileError) console.warn('Fichier du statut non supprimé:', fileError.message);
    }
    closeStatusViewer();
    await loadStatuses();
    notify('Statut supprimé.');
  } catch (error) {
    errorMessage(error);
    showViewerStatus();
  }
});
document.addEventListener('keydown', event => {
  if ($('statusViewer')?.hidden !== false) return;
  if (event.key === 'Escape') closeStatusViewer();
  if (event.key === 'ArrowRight') viewerNext();
  if (event.key === 'ArrowLeft') viewerPrev();
});
/* =====================================================
   NOTIFICATIONS
===================================================== */
async function loadNotifications() {
  if (!me || !db) return;
  const box = $('notificationsList');
  if (!box) return;
  const { data, error } = await db
    .from('notifications')
    .select('id, kind, payload, is_read, created_at')
    .eq('user_id', me.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  box.replaceChildren();
  if (!data?.length) {
    box.textContent = 'Aucune notification.';
    return;
  }
  data.forEach(notification => {
    const item = document.createElement('div');
    item.className = 'panel';
    item.textContent =
      (notification.kind || 'Notification') +
      (notification.is_read ? ' — lue' : ' — non lue');
    box.append(item);
  });
}
/* =====================================================
   NAVIGATION
===================================================== */
const tabTargets = {
  chats: 'chatSection',
  status: 'statusSection',
  contacts: 'contactsSection',
  settings: 'settingsSection',
  notifications: 'notificationsSection'
};
const tabTitles = {
  chats: 'Discussions',
  status: 'Actus',
  contacts: 'Contacts',
  settings: 'Vous',
  notifications: 'Notifications'
};
function showTab(tab) {
  currentTab = tab;
  if ($('home')) $('home').dataset.tab = tab;
  if ($('pageTitle')) {
    $('pageTitle').textContent = tabTitles[tab] || 'TRUE CHAT';
  }
  Object.values(tabTargets).forEach(id => {
    $show(id, false);
  });
  if (tabTargets[tab]) {
    $show(tabTargets[tab], true);
  }
  document.querySelectorAll('nav [data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  positionNav();
  if (tab === 'status') {
    loadStatuses().catch(errorMessage);
  }
  if (tab === 'contacts') {
    loadContacts().catch(errorMessage);
  }
  if (tab === 'settings') {
    showSettings();
  }
  if (tab === 'notifications') {
    loadNotifications().catch(errorMessage);
  }
}
document.querySelectorAll('nav [data-tab]').forEach(button => {
  button.addEventListener('click', () => {
    showTab(button.dataset.tab);
  });
});
/* =====================================================
   CONTACTS
===================================================== */
function renderContactsList(items) {
  const box = $('contactsList');
  if (!box) return;
  box.replaceChildren();
  if (!items?.length) {
    box.textContent = 'Aucun contact enregistré.';
    return;
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.textContent = item.name;
    button.onclick = () => startPrivateChat(item.id);
    box.append(button);
  }
}
async function loadContacts() {
  if (!me) return;
  const box = $('contactsList');
  if (!box) return;
  const cached = cacheGet('contacts');
  if (cached) renderContactsList(cached);   // affichage immédiat
  try {
    const { data, error } = await db
      .from('contacts')
      .select('contact_id, nickname')
      .eq('owner_id', me.id);
    if (error) throw error;
    const items = [];
    for (const contact of data || []) {
      const { data: user, error: userError } = await db
        .from('profiles')
        .select('id, username, full_name')
        .eq('id', contact.contact_id)
        .maybeSingle();
      if (userError) throw userError;
      if (!user) continue;
      items.push({ id: user.id, name: contact.nickname || user.full_name || user.username });
    }
    cacheSet('contacts', items);
    renderContactsList(items);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    if (!cached) renderContactsList([]);
  }
}
/* =====================================================
   RÉGLAGES DE DISCUSSION : préférences locales
   (médias, important, thème, enregistrement, éphémères,
    verrouillage, confidentialité avancée, chiffrement)
===================================================== */
const PREFS_DEFAULT = () => ({
  theme: { global: 'default', rooms: {} },
  saveMode: 'default',            // default | always | never
  ephemeral: { global: 0, rooms: {} },
  adv: { global: false, rooms: {} },
  lockAll: false,
  lockedRooms: {},
  pinSalt: '',
  pinHash: '',
  starred: {},
  hidden: {},
  unread: {},
  lastRead: {},
  archived: {},
  muted: {},
  favorites: {},
  lists: {},
  clearedAt: {},
  deletedRooms: {},
  sound: { person: 'cristal', group: 'goutte', vibrate: true },
  stAudience: { mode: 'contacts', ids: [] }
});
let prefs = PREFS_DEFAULT();
const prefsKey = () => 'truechat.prefs.' + (me?.id || 'anon');
function loadPrefs() {
  prefs = PREFS_DEFAULT();
  try {
    const raw = JSON.parse(localStorage.getItem(prefsKey()) || '{}');
    prefs = {
      ...prefs, ...raw,
      theme: { ...prefs.theme, ...(raw.theme || {}) },
      ephemeral: { ...prefs.ephemeral, ...(raw.ephemeral || {}) },
      adv: { ...prefs.adv, ...(raw.adv || {}) },
      sound: { ...prefs.sound, ...(raw.sound || {}) },
      stAudience: { ...prefs.stAudience, ...(raw.stAudience || {}) }
    };
  } catch (error) {
    console.warn('Préférences illisibles:', error);
  }
}
function savePrefs() {
  try {
    localStorage.setItem(prefsKey(), JSON.stringify(prefs));
  } catch (error) {
    console.warn('Préférences non enregistrées:', error);
  }
}
function clearLockPrefs() {
  prefs.lockAll = false;
  prefs.lockedRooms = {};
  prefs.pinSalt = '';
  prefs.pinHash = '';
  savePrefs();
}

/* Colonnes facultatives (voir SETUP-fonctionnalites.sql) */
const FEATURE = { expiry: false, convExpiry: false };
async function probeFeatures() {
  if (!db) return;
  if (!navigator.onLine) {
    Object.assign(FEATURE, cacheGet('features') || {});
    return;
  }
  try {
    const { error } = await db.from('messages').select('expires_at').limit(1);
    FEATURE.expiry = !error;
  } catch (error) {
    FEATURE.expiry = false;
  }
  try {
    const { error } = await db.from('conversations').select('ephemeral_seconds').limit(1);
    FEATURE.convExpiry = !error;
  } catch (error) {
    FEATURE.convExpiry = false;
  }
  cacheSet('features', FEATURE);
}

/* ---------- Valeurs effectives (discussion > général) ---------- */
const roomMeta = {};   // id -> { ephemeral_seconds }
const sessionUnlocked = new Set();
let showLockedList = false;

function themeFor(roomId) {
  return (roomId && prefs.theme.rooms[roomId]) || prefs.theme.global || 'default';
}
function ephemeralFor(roomId) {
  const fromDb = roomId ? roomMeta[roomId]?.ephemeral_seconds : null;
  if (fromDb !== null && fromDb !== undefined) return Number(fromDb) || 0;
  const local = roomId ? prefs.ephemeral.rooms[roomId] : undefined;
  if (local !== undefined) return local;
  return prefs.ephemeral.global || 0;
}
function advFor(roomId) {
  const local = roomId ? prefs.adv.rooms[roomId] : undefined;
  return local !== undefined ? Boolean(local) : Boolean(prefs.adv.global);
}
const isRoomLocked = roomId => Boolean(roomId && prefs.lockedRooms[roomId]);

const THEMES = [
  { id: 'default', name: 'Par défaut', bg: '', mine: '' },
  { id: 'ocean', name: 'Océan', bg: 'linear-gradient(180deg,#06243a,#0a4a6e)', mine: 'linear-gradient(135deg,#1e8bff,#0ec3d6)' },
  { id: 'violet', name: 'Violet', bg: 'linear-gradient(180deg,#1a0b33,#3b1b75)', mine: 'linear-gradient(135deg,#7c3aed,#c026d3)' },
  { id: 'foret', name: 'Forêt', bg: 'linear-gradient(180deg,#07210f,#12532a)', mine: 'linear-gradient(135deg,#1f9d55,#7bd88f)' },
  { id: 'sunset', name: 'Coucher de soleil', bg: 'linear-gradient(180deg,#2b0f1a,#7a2e1c)', mine: 'linear-gradient(135deg,#f97316,#e11d48)' },
  { id: 'rose', name: 'Rose', bg: 'linear-gradient(180deg,#2d0b24,#7a1b57)', mine: 'linear-gradient(135deg,#ec4899,#f472b6)' },
  { id: 'nuit', name: 'Nuit', bg: '#000', mine: 'linear-gradient(135deg,#334155,#1e293b)' },
  { id: 'or', name: 'Or', bg: 'linear-gradient(180deg,#1b1405,#4a3a0c)', mine: 'linear-gradient(135deg,#d4a017,#f2c94c)' }
];
const EPHEMERAL_OPTIONS = [
  { value: 0, label: 'Désactivés' },
  { value: 3600, label: '1 heure' },
  { value: 86400, label: '24 heures' },
  { value: 604800, label: '7 jours' }
];
const ephemeralLabel = seconds =>
  (EPHEMERAL_OPTIONS.find(option => option.value === seconds)?.label) || 'Non';
const SAVE_OPTIONS = [
  { value: 'default', label: 'Par défaut', hint: 'Petit bouton ⬇ sur chaque photo ou vidéo.' },
  { value: 'always', label: 'Toujours', hint: 'Bouton « Enregistrer » bien visible sous chaque photo ou vidéo.' },
  { value: 'never', label: 'Jamais', hint: 'Aucun bouton d’enregistrement.' }
];
const saveLabel = mode => SAVE_OPTIONS.find(option => option.value === mode)?.label || 'Par défaut';

function applyRoomLook() {
  const el = $('room');
  if (!el) return;
  const theme = THEMES.find(item => item.id === themeFor(room)) || THEMES[0];
  if (theme.bg) el.style.setProperty('--chat-bg', theme.bg);
  else el.style.removeProperty('--chat-bg');
  if (theme.mine) el.style.setProperty('--mine-bg', theme.mine);
  else el.style.removeProperty('--mine-bg');
  el.classList.toggle('adv', advFor(room));
  const info = [];
  if (isRoomLocked(room)) info.push('🔒 Verrouillée');
  const eph = ephemeralFor(room);
  if (eph) info.push('⏱ Éphémères : ' + ephemeralLabel(eph));
  if ($('roomInfo')) $('roomInfo').textContent = info.join(' · ');
}

/* =====================================================
   CODE PIN (verrouillage local sur cet appareil)
===================================================== */
async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buffer))
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}
let pinResolver = null;
function askPin(title, hint = '') {
  return new Promise(resolve => {
    pinResolver = resolve;
    $('pinTitle').textContent = title;
    $('pinHint').textContent = hint;
    $('pinInput').value = '';
    $show('pinSheet', true);
    setTimeout(() => $('pinInput')?.focus(), 50);
  });
}
function closePin(value) {
  $show('pinSheet', false);
  const resolve = pinResolver;
  pinResolver = null;
  if (resolve) resolve(value);
}
$('pinForm')?.addEventListener('submit', event => {
  event.preventDefault();
  closePin($('pinInput').value.trim());
});
$('pinCancel')?.addEventListener('click', () => closePin(null));
async function ensurePin() {
  if (prefs.pinHash) return true;
  const first = await askPin('Créer un code', 'Choisissez un code de 4 à 8 chiffres.');
  if (first === null) return false;
  if (!/^\d{4,8}$/.test(first)) {
    notify('Le code doit contenir 4 à 8 chiffres.');
    return false;
  }
  const second = await askPin('Confirmer le code', 'Saisissez le même code.');
  if (second === null) return false;
  if (first !== second) {
    notify('Les deux codes sont différents.');
    return false;
  }
  prefs.pinSalt = crypto.randomUUID();
  prefs.pinHash = await sha256(prefs.pinSalt + ':' + first);
  savePrefs();
  return true;
}
async function verifyPin(title = 'Saisissez votre code') {
  if (!prefs.pinHash) return true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const value = await askPin(title, attempt ? 'Code incorrect, réessayez.' : '');
    if (value === null) return false;
    if (await sha256(prefs.pinSalt + ':' + value) === prefs.pinHash) return true;
  }
  notify('Trop d’essais. Réessayez plus tard.');
  return false;
}

/* ---------- Écran de verrouillage de l'application ---------- */
let hiddenAt = 0;
function showLockScreen() {
  if (!me || !prefs.lockAll || !prefs.pinHash) return;
  $show('lockScreen', true);
  $('lockInput').value = '';
  $('lockError').textContent = '';
  setTimeout(() => $('lockInput')?.focus(), 50);
}
$('lockForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const value = $('lockInput').value.trim();
  if (await sha256(prefs.pinSalt + ':' + value) === prefs.pinHash) {
    $show('lockScreen', false);
    $('lockInput').value = '';
  } else {
    $('lockError').textContent = 'Code incorrect.';
    $('lockInput').value = '';
  }
});
$('lockLogout')?.addEventListener('click', async () => {
  clearLockPrefs();
  $show('lockScreen', false);
  $('logout')?.click();
});
document.addEventListener('visibilitychange', () => {
  const sensitive = advFor(room) || prefs.adv.global;
  document.body.classList.toggle('blurred', document.hidden && sensitive);
  if (document.hidden) {
    hiddenAt = Date.now();
    sessionUnlocked.clear();
    showLockedList = false;
  } else if (hiddenAt && Date.now() - hiddenAt > 30000) {
    showLockScreen();
    if (currentTab === 'chats') renderChatList();
  }
});
window.addEventListener('pagehide', () => {
  if (advFor(room) || prefs.adv.global) document.body.classList.add('blurred');
});
window.addEventListener('pageshow', () => document.body.classList.remove('blurred'));

/* =====================================================
   FEUILLE D'OPTIONS (réutilisée partout)
===================================================== */
let optScope = null;    // identifiant de discussion, ou null = réglage général
function closeSheet() {
  $show('optSheet', false);
}
$('optClose')?.addEventListener('click', closeSheet);
$('optSheet')?.addEventListener('click', event => {
  if (event.target === $('optSheet')) closeSheet();
});
function sheetOpen(title, builder) {
  $('optTitle').textContent = title;
  const body = $('optBody');
  body.replaceChildren();
  builder(body);
  $show('optSheet', true);
}
function scopeLabel() {
  return optScope ? 'Cette discussion' : 'Toutes les discussions (par défaut)';
}
function scopeNote(text) {
  const p = document.createElement('p');
  p.className = 'opt-note';
  p.textContent = text;
  return p;
}
function optRow(label, value, onClick, opts = {}) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'opt-row' + (opts.selected ? ' sel' : '');
  const left = document.createElement('span');
  left.className = 'opt-l';
  const b = document.createElement('b');
  b.textContent = label;
  left.append(b);
  if (opts.hint) {
    const small = document.createElement('small');
    small.textContent = opts.hint;
    left.append(small);
  }
  const right = document.createElement('span');
  right.className = 'opt-r';
  right.textContent = opts.selected ? '✓' : (value ?? '');
  row.append(left, right);
  if (onClick) row.addEventListener('click', onClick);
  return row;
}


/* =====================================================
   FOND ANIMÉ : BOULES PERSONNALISABLES (couleurs, taille, vitesse)
===================================================== */
const BG_PRESETS = [
  { id: 'aurore', name: 'Aurore', colors: ['#1a6bff', '#2fe0a0', '#d63fe6', '#5b3df0'] },
  { id: 'ocean', name: 'Océan', colors: ['#06b6d4', '#38bdf8', '#2563eb', '#0ea5a4'] },
  { id: 'sunset', name: 'Coucher de soleil', colors: ['#f97316', '#fbbf24', '#e11d48', '#c026d3'] },
  { id: 'foret', name: 'Forêt', colors: ['#16a34a', '#84cc16', '#0d9488', '#15803d'] },
  { id: 'rose', name: 'Rose', colors: ['#ec4899', '#f9a8d4', '#a21caf', '#fb7185'] },
  { id: 'neon', name: 'Néon', colors: ['#22d3ee', '#a3e635', '#f0abfc', '#facc15'] },
  { id: 'or', name: 'Or', colors: ['#d4a017', '#fde68a', '#b45309', '#f59e0b'] },
  { id: 'nuit', name: 'Nuit', colors: ['#334155', '#1e3a8a', '#4c1d95', '#0f766e'] }
];
const BG_KEY = 'truechat.bg';
const BG_SPEEDS = [
  { value: 0, label: 'Arrêtées' }, { value: 0.6, label: 'Lentes' },
  { value: 1, label: 'Normales' }, { value: 1.8, label: 'Rapides' }
];
const bgDefault = () => ({ preset: 'aurore', colors: [...BG_PRESETS[0].colors], size: 1, speed: 1 });
let bgPrefs = bgDefault();
try {
  const saved = JSON.parse(localStorage.getItem(BG_KEY) || 'null');
  if (saved && Array.isArray(saved.colors) && saved.colors.length === 4) bgPrefs = { ...bgDefault(), ...saved };
} catch (error) { /* ignoré */ }
function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0);
}
function mixHex(a, b, t) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const orbGradient = color =>
  'linear-gradient(145deg, ' + mixHex(color, '#ffffff', .42) + ' 0%, ' + color + ' 55%, ' + mixHex(color, '#000000', .38) + ' 100%)';
function applyBg() {
  const el = $('bg');
  if (!el) return;
  const isDefault = bgPrefs.preset === 'aurore' &&
    bgPrefs.colors.every((c, i) => c === BG_PRESETS[0].colors[i]);
  bgPrefs.colors.forEach((color, i) => {
    if (isDefault) el.style.removeProperty('--o' + (i + 1));
    else el.style.setProperty('--o' + (i + 1), orbGradient(color));
  });
  el.style.setProperty('--bgsize', String(bgPrefs.size));
  el.style.setProperty('--bgslow', String(bgPrefs.speed ? 1 / bgPrefs.speed : 1));
  el.classList.toggle('still', !bgPrefs.speed);
}
function saveBg() {
  try { localStorage.setItem(BG_KEY, JSON.stringify(bgPrefs)); } catch (error) { /* ignoré */ }
}
applyBg();
function renderBgSection(box) {
  box.replaceChildren();
  const title = document.createElement('h4');
  title.className = 'sec-title';
  title.textContent = 'Fond animé : les boules';
  box.append(title, scopeNote('Le fond change dans toute l’application. Choisissez un style ou composez le vôtre.'));
  const grid = document.createElement('div');
  grid.className = 'theme-grid';
  BG_PRESETS.forEach(preset => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'theme-tile bg-tile' + (bgPrefs.preset === preset.id ? ' sel' : '');
    preset.colors.forEach(color => {
      const orb = document.createElement('b');
      orb.style.background = orbGradient(color);
      tile.append(orb);
    });
    const name = document.createElement('span');
    name.textContent = preset.name;
    tile.append(name);
    tile.addEventListener('click', () => {
      bgPrefs.preset = preset.id;
      bgPrefs.colors = [...preset.colors];
      applyBg();
      saveBg();
      renderBgSection(box);
    });
    grid.append(tile);
  });
  box.append(grid);

  const pickers = document.createElement('div');
  pickers.className = 'bg-colors';
  bgPrefs.colors.forEach((color, i) => {
    const wrap = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = color;
    input.addEventListener('input', () => {
      bgPrefs.colors[i] = input.value;
      bgPrefs.preset = 'custom';
      applyBg();
    });
    input.addEventListener('change', () => {
      saveBg();
      grid.querySelectorAll('.bg-tile.sel').forEach(tile => tile.classList.remove('sel'));
    });
    const text = document.createElement('span');
    text.textContent = 'Boule ' + (i + 1);
    wrap.append(input, text);
    pickers.append(wrap);
  });
  box.append(scopeNote('Vos couleurs : touchez une boule pour changer sa couleur.'), pickers);

  const size = document.createElement('div');
  size.className = 'bg-range';
  const sizeLabel = document.createElement('span');
  sizeLabel.textContent = 'Taille';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = '0.6';
  range.max = '1.5';
  range.step = '0.05';
  range.value = String(bgPrefs.size);
  range.addEventListener('input', () => {
    bgPrefs.size = Number(range.value);
    applyBg();
  });
  range.addEventListener('change', saveBg);
  size.append(sizeLabel, range);
  box.append(size);

  const speeds = document.createElement('div');
  speeds.className = 'opt-tabs';
  BG_SPEEDS.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.className = bgPrefs.speed === option.value ? 'on' : '';
    button.addEventListener('click', () => {
      bgPrefs.speed = option.value;
      applyBg();
      saveBg();
      renderBgSection(box);
    });
    speeds.append(button);
  });
  box.append(speeds);
  box.append(optRow('Remettre le fond d’origine', '', () => {
    bgPrefs = bgDefault();
    applyBg();
    saveBg();
    renderBgSection(box);
  }));
}

/* ---------- Thème de la discussion ---------- */
function openThemeSheet() {
  sheetOpen('Thème de la discussion', body => {
    body.append(scopeNote(scopeLabel()));
    const grid = document.createElement('div');
    grid.className = 'theme-grid';
    THEMES.forEach(theme => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'theme-tile' + (themeFor(optScope) === theme.id ? ' sel' : '');
      tile.style.background = theme.bg || 'linear-gradient(180deg,#0a0a0a,#1b1b1b)';
      const bubble = document.createElement('i');
      bubble.style.background = theme.mine ||
        'linear-gradient(135deg, rgba(30,139,255,.8), rgba(124,58,237,.8))';
      const name = document.createElement('span');
      name.textContent = theme.name;
      tile.append(bubble, name);
      tile.addEventListener('click', () => {
        if (optScope) prefs.theme.rooms[optScope] = theme.id;
        else prefs.theme.global = theme.id;
        savePrefs();
        applyRoomLook();
        openThemeSheet();
      });
      grid.append(tile);
    });
    body.append(grid);
    if (optScope && prefs.theme.rooms[optScope]) {
      body.append(optRow('Utiliser le thème général', '', () => {
        delete prefs.theme.rooms[optScope];
        savePrefs();
        applyRoomLook();
        openThemeSheet();
      }));
    }
    const bgBox = document.createElement('div');
    renderBgSection(bgBox);
    body.append(bgBox);
  });
}

/* ---------- Enregistrer (Photos) ---------- */
function openSaveSheet() {
  sheetOpen('Enregistrer (Photos)', body => {
    body.append(scopeNote(
      'Les navigateurs ne peuvent pas enregistrer seuls dans la galerie : ' +
      'un bouton vous propose d’enregistrer la photo ou la vidéo.'
    ));
    SAVE_OPTIONS.forEach(option => {
      body.append(optRow(option.label, '', () => {
        prefs.saveMode = option.value;
        savePrefs();
        renderSettingsRows();
        openSaveSheet();
        if (room) refreshSaveButtons();
      }, { selected: prefs.saveMode === option.value, hint: option.hint }));
    });
  });
}
async function saveMediaFile(url, name, mimeHint) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const file = new File([blob], name || 'media', { type: blob.type || mimeHint || '' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });   // iOS : « Enregistrer l'image / la vidéo »
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name || 'media';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  } catch (error) {
    if (error?.name !== 'AbortError') notify('Enregistrement impossible : ' + (error.message || error));
  }
}
function addSaveButton(bubble, url, name, type) {
  if (prefs.saveMode === 'never' || advFor(room)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'save-btn ' + (prefs.saveMode === 'always' ? 'wide' : 'mini');
  button.textContent = prefs.saveMode === 'always' ? '⬇ Enregistrer' : '⬇';
  button.setAttribute('aria-label', 'Enregistrer');
  button.addEventListener('click', event => {
    event.stopPropagation();
    saveMediaFile(url, name, type === 'video' ? 'video/mp4' : 'image/jpeg');
  });
  bubble.append(button);
}
function refreshSaveButtons() {
  if (room) loadMessages().catch(errorMessage);
}

/* ---------- Messages éphémères ---------- */
function openEphemeralSheet() {
  sheetOpen('Messages éphémères', body => {
    body.append(scopeNote(
      scopeLabel() + ' — les nouveaux messages disparaîtront après la durée choisie. ' +
      'Les anciens messages ne changent pas.'
    ));
    if (!FEATURE.expiry) {
      body.append(scopeNote(
        '⚠ Pour que les messages disparaissent chez tout le monde, exécutez ' +
        'SETUP-fonctionnalites.sql dans Supabase (colonne expires_at). ' +
        'Sans cela, le réglage est enregistré mais n’efface rien.'
      ));
    }
    const current = ephemeralFor(optScope);
    EPHEMERAL_OPTIONS.forEach(option => {
      body.append(optRow(option.label, '', async () => {
        if (optScope) {
          prefs.ephemeral.rooms[optScope] = option.value;
          if (FEATURE.convExpiry) {
            const { error } = await db.from('conversations')
              .update({ ephemeral_seconds: option.value }).eq('id', optScope);
            if (error) console.warn('ephemeral_seconds:', error.message);
            else roomMeta[optScope] = { ephemeral_seconds: option.value };
          }
        } else {
          prefs.ephemeral.global = option.value;
        }
        savePrefs();
        applyRoomLook();
        renderSettingsRows();
        openEphemeralSheet();
      }, { selected: current === option.value }));
    });
  });
}
function expiryFields(roomId) {
  const seconds = ephemeralFor(roomId);
  if (!seconds || !FEATURE.expiry) return {};
  return { expires_at: new Date(Date.now() + seconds * 1000).toISOString() };
}
const isExpired = message =>
  Boolean(message?.expires_at && new Date(message.expires_at).getTime() <= Date.now());
function scheduleExpiry(message, bubble) {
  if (!message?.expires_at) return;
  const left = new Date(message.expires_at).getTime() - Date.now();
  if (left <= 0) {
    bubble.remove();
    return;
  }
  // setTimeout plafonne à ~24,8 jours
  setTimeout(() => bubble.remove(), Math.min(left, 2147000000));
}

/* ---------- Confidentialité avancée ---------- */
function openPrivacySheet() {
  sheetOpen('Confidentialité avancée', body => {
    body.append(scopeNote(scopeLabel()));
    const on = advFor(optScope);
    body.append(optRow(on ? 'Activée' : 'Désactivée', '', () => {
      if (optScope) prefs.adv.rooms[optScope] = !on;
      else prefs.adv.global = !on;
      savePrefs();
      applyRoomLook();
      renderSettingsRows();
      renderChatList();
      openPrivacySheet();
    }, { selected: on, hint: 'Touchez pour ' + (on ? 'désactiver.' : 'activer.') }));
    body.append(scopeNote(
      'Quand elle est activée : aperçus des messages masqués dans la liste, ' +
      'copie et sélection du texte bloquées, boutons d’enregistrement et « Important » retirés, ' +
      'et l’écran est flouté quand l’app passe en arrière-plan. ' +
      'Un navigateur ne peut pas bloquer les captures d’écran.'
    ));
    if (optScope) {
      body.append(optRow('Utiliser le réglage général', '', () => {
        delete prefs.adv.rooms[optScope];
        savePrefs();
        applyRoomLook();
        renderChatList();
        openPrivacySheet();
      }));
    }
  });
}

/* ---------- Chiffrement (informations réelles) ---------- */
function openEncryptionSheet() {
  sheetOpen('Chiffrement', body => {
    const secure = location.protocol === 'https:';
    const lines = [
      [secure, 'Connexion chiffrée (HTTPS) entre votre appareil et Supabase'],
      [Boolean(me), 'Session authentifiée : seuls les membres lisent une discussion (règles RLS)'],
      [true, 'Médias privés : liens signés qui expirent au bout d’1 heure'],
      [false, 'Chiffrement de bout en bout : non (Supabase peut techniquement lire les données stockées)']
    ];
    lines.forEach(([ok, text]) => {
      const row = document.createElement('div');
      row.className = 'enc-line';
      const icon = document.createElement('span');
      icon.textContent = ok ? '✅' : 'ℹ️';
      const label = document.createElement('span');
      label.textContent = text;
      row.append(icon, label);
      body.append(row);
    });
    if (!secure) {
      body.append(scopeNote('⚠ Cette page n’est pas en HTTPS : hébergez l’app en HTTPS.'));
    }
  });
}

/* ---------- Verrouillage ---------- */
async function toggleRoomLock(roomId) {
  if (isRoomLocked(roomId)) {
    if (!(await verifyPin('Code pour déverrouiller'))) return;
    delete prefs.lockedRooms[roomId];
  } else {
    if (!(await ensurePin())) return;
    prefs.lockedRooms[roomId] = true;
    sessionUnlocked.add(roomId);
  }
  savePrefs();
  applyRoomLook();
  renderChatList();
}
async function toggleLockAll(wantOn) {
  if (wantOn) {
    if (!(await ensurePin())) return false;
    prefs.lockAll = true;
  } else {
    if (!(await verifyPin('Code pour désactiver le verrouillage'))) return false;
    prefs.lockAll = false;
  }
  savePrefs();
  return true;
}

/* ---------- Important (messages favoris) ---------- */
const starredList = () =>
  Object.values(prefs.starred).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
function toggleStar(message) {
  if (prefs.starred[message.id]) {
    delete prefs.starred[message.id];
  } else {
    prefs.starred[message.id] = {
      id: message.id,
      conversation_id: message.conversation_id,
      content: message.content || null,
      type: message.type,
      media_name: message.media_name || null,
      created_at: message.created_at
    };
  }
  savePrefs();
  renderSettingsRows();
}
function openImportantSheet() {
  sheetOpen('Important', body => {
    const items = starredList().filter(item => !optScope || item.conversation_id === optScope);
    if (!items.length) {
      body.append(scopeNote(
        'Aucun message important. Maintenez un message appuyé, puis choisissez « Marquer comme important ».'
      ));
      return;
    }
    items.forEach(item => {
      const chat = chatRows.find(row => row.id === item.conversation_id);
      const text = item.content ||
        ({ image: '📷 Photo', video: '🎥 Vidéo', voice: '🎤 Message vocal', file: '📄 ' + (item.media_name || 'Fichier') }[item.type] || 'Message');
      const row = optRow(text.length > 90 ? text.slice(0, 90) + '…' : text, '', () => {
        closeSheet();
        openRoom(item.conversation_id).then(() => {
          const target = $('messages')?.querySelector('[data-id="' + item.id + '"]');
          if (target) {
            target.scrollIntoView({ block: 'center' });
            target.classList.add('flash');
            setTimeout(() => target.classList.remove('flash'), 1800);
          }
        });
      }, {
        hint: (chat?.name || 'Discussion') + ' · ' +
          (item.created_at ? new Date(item.created_at).toLocaleDateString('fr-FR') : '')
      });
      const remove = document.createElement('span');
      remove.className = 'opt-r';
      remove.textContent = '⭐';
      row.querySelector('.opt-r').replaceWith(remove);
      remove.addEventListener('click', event => {
        event.stopPropagation();
        delete prefs.starred[item.id];
        savePrefs();
        renderSettingsRows();
        openImportantSheet();
      });
      body.append(row);
    });
  });
}

/* ---------- Actions sur un message (appui long) ---------- */
function markBubbleDeleted(bubble, message) {
  if (message) message.deleted_at = message.deleted_at || new Date().toISOString();
  bubble.classList.remove('starred');
  bubble.replaceChildren();
  bubble.textContent = 'Ce message a été supprimé.';
  bubble.style.fontStyle = 'italic';
  bubble.style.opacity = '.7';
}
function deleteForMe(message, bubble) {
  closeSheet();
  prefs.hidden = prefs.hidden || {};
  prefs.hidden[message.id] = true;
  delete prefs.starred[message.id];
  savePrefs();
  renderSettingsRows();
  bubble.remove();
  notify('Message supprimé pour vous.');
}
async function deleteForEveryone(message, bubble) {
  closeSheet();
  try {
    const run = patch => db.from('messages').update(patch)
      .eq('id', message.id).eq('sender_id', me.id).select('id');
    let result = await run({ deleted_at: new Date().toISOString(), content: null, media_path: null });
    if (result.error) {
      // certaines bases refusent content/media_path vides : on garde au moins deleted_at
      result = await run({ deleted_at: new Date().toISOString() });
    }
    if (result.error) throw result.error;
    if (!result.data?.length) {
      throw new Error('Suppression refusée par la base (règle RLS). Exécutez SUPPRESSION.sql dans Supabase (SQL Editor), puis réessayez.');
    }
    if (message.media_path) {
      const { error: fileError } = await db.storage.from('media').remove([message.media_path]);
      if (fileError) console.warn('Fichier non supprimé:', fileError.message);
    }
    delete prefs.starred[message.id];
    savePrefs();
    renderSettingsRows();
    markBubbleDeleted(bubble, message);
    notify('Message supprimé pour tout le monde.');
  } catch (error) {
    errorMessage(error);
  }
}
function openMessageActions(message, bubble) {
  if (message.deleted_at) return;
  const adv = advFor(room);
  const mine = message.sender_id === me?.id;
  optScope = room;
  sheetOpen('Message', body => {
    if (!adv) {
      const starred = Boolean(prefs.starred[message.id]);
      body.append(optRow(
        starred ? 'Retirer des importants' : 'Marquer comme important',
        starred ? '⭐' : '☆',
        () => {
          toggleStar(message);
          bubble.classList.toggle('starred', Boolean(prefs.starred[message.id]));
          closeSheet();
        }
      ));
      if (message.content) {
        body.append(optRow('Copier le texte', '', async () => {
          try {
            await navigator.clipboard.writeText(message.content);
            notify('Texte copié.');
          } catch (error) {
            notify('Copie impossible sur cet appareil.');
          }
          closeSheet();
        }));
      }
    }
    body.append(optRow('Supprimer', '🗑', async () => {
      closeSheet();
      const choice = await glassDialog({
        title: 'Supprimer le message ?',
        actions: [
          { label: 'Supprimer pour moi', value: 'me', danger: true },
          ...(mine ? [{ label: 'Supprimer pour tout le monde', value: 'all', danger: true }] : []),
          { label: 'Annuler', value: null }
        ]
      });
      if (choice === 'me') deleteForMe(message, bubble);
      else if (choice === 'all') deleteForEveryone(message, bubble);
    }));
  });
}
function attachMessageActions(message, bubble) {
  if (!message.id) return;
  if (prefs.starred[message.id]) bubble.classList.add('starred');
  let timer = null;
  const start = event => {
    if (event.target.closest('audio, video, a, button, .vm-track')) return;
    clearTimeout(timer);
    timer = setTimeout(() => openMessageActions(message, bubble), 500);
  };
  const stop = () => clearTimeout(timer);
  bubble.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach(name =>
    bubble.addEventListener(name, stop));
  bubble.addEventListener('contextmenu', event => {
    event.preventDefault();
    openMessageActions(message, bubble);
  });
}

/* ---------- Médias, liens et docs ---------- */
const URL_RE = /https?:\/\/[^\s<>"']+/gi;
function openMediaSheet(initialTab = 'media') {
  sheetOpen('Médias, liens et docs', async body => {
    body.append(scopeNote(optScope ? 'Cette discussion' : 'Toutes vos discussions'));
    const tabs = document.createElement('div');
    tabs.className = 'opt-tabs';
    const content = document.createElement('div');
    body.append(tabs, content);
    const names = { media: 'Médias', docs: 'Docs', links: 'Liens' };
    let loaded = null;
    const render = async tab => {
      tabs.replaceChildren();
      Object.entries(names).forEach(([key, label]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = key === tab ? 'on' : '';
        button.textContent = label;
        button.addEventListener('click', () => render(key));
        tabs.append(button);
      });
      content.replaceChildren(scopeNote('Chargement…'));
      try {
        loaded = loaded || await fetchSharedItems();
        content.replaceChildren();
        await renderSharedItems(tab, loaded, content);
      } catch (error) {
        content.replaceChildren(scopeNote('Erreur : ' + (error.message || error)));
      }
    };
    render(initialTab);
  });
}
async function fetchSharedItems() {
  let mediaQuery = db.from('messages')
    .select('id, conversation_id, sender_id, content, type, media_path, media_name, media_size, created_at, deleted_at')
    .not('media_path', 'is', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  let linkQuery = db.from('messages')
    .select('id, conversation_id, content, created_at, deleted_at')
    .ilike('content', '%http%')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200);
  if (optScope) {
    mediaQuery = mediaQuery.eq('conversation_id', optScope);
    linkQuery = linkQuery.eq('conversation_id', optScope);
  }
  const [media, links] = await Promise.all([mediaQuery, linkQuery]);
  if (media.error) throw media.error;
  if (links.error) throw links.error;
  return { media: media.data || [], links: links.data || [] };
}
async function signedUrls(items) {
  const paths = items.map(item => item.media_path);
  if (!paths.length) return {};
  const { data, error } = await db.storage.from('media').createSignedUrls(paths, 3600);
  if (error) throw error;
  const map = {};
  (data || []).forEach(entry => {
    if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
  });
  return map;
}
async function renderSharedItems(tab, data, box) {
  if (tab === 'links') {
    const found = [];
    data.links.forEach(message => {
      (message.content.match(URL_RE) || []).forEach(url =>
        found.push({ url, created_at: message.created_at }));
    });
    if (!found.length) {
      box.append(scopeNote('Aucun lien partagé.'));
      return;
    }
    found.forEach(item => {
      const a = document.createElement('a');
      a.className = 'opt-link';
      a.href = item.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.url;
      box.append(a);
    });
    return;
  }
  const items = data.media.filter(item =>
    tab === 'media'
      ? item.type === 'image' || item.type === 'video'
      : item.type === 'file' || item.type === 'voice');
  if (!items.length) {
    box.append(scopeNote(tab === 'media' ? 'Aucune photo ni vidéo.' : 'Aucun document.'));
    return;
  }
  const urls = await signedUrls(items);
  if (tab === 'media') {
    const grid = document.createElement('div');
    grid.className = 'media-grid';
    items.forEach(item => {
      const url = urls[item.media_path];
      if (!url) return;
      const cell = document.createElement('a');
      cell.href = url;
      cell.target = '_blank';
      cell.rel = 'noopener noreferrer';
      if (item.type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.alt = item.media_name || 'Photo';
        cell.append(img);
      } else {
        const video = document.createElement('video');
        video.src = url + '#t=0.1';
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        cell.append(video);
        const tag = document.createElement('span');
        tag.textContent = '▶';
        cell.append(tag);
      }
      grid.append(cell);
    });
    box.append(grid);
    return;
  }
  items.forEach(item => {
    const url = urls[item.media_path];
    if (!url) return;
    const a = document.createElement('a');
    a.className = 'opt-link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = (item.type === 'voice' ? '🎤 ' : '📄 ') + (item.media_name || 'Fichier') +
      (item.media_size ? ' — ' + formatSize(item.media_size) : '');
    box.append(a);
  });
}

/* ---------- Gérer le stockage ---------- */
async function openStorageSheet() {
  sheetOpen('Gérer le stockage', async body => {
    body.append(scopeNote('Chargement…'));
    try {
      const { data, error } = await db.from('messages')
        .select('type, media_size')
        .eq('sender_id', me.id)
        .not('media_path', 'is', null)
        .limit(1000);
      if (error) throw error;
      const totals = {};
      let all = 0;
      (data || []).forEach(row => {
        const key = row.type || 'file';
        totals[key] = totals[key] || { count: 0, size: 0 };
        totals[key].count += 1;
        totals[key].size += row.media_size || 0;
        all += row.media_size || 0;
      });
      body.replaceChildren(scopeNote('Médias envoyés par vous'));
      const labels = { image: '📷 Photos', video: '🎥 Vidéos', voice: '🎤 Vocaux et audio', file: '📄 Fichiers' };
      Object.keys(labels).forEach(key => {
        const t = totals[key] || { count: 0, size: 0 };
        body.append(optRow(labels[key], t.count + ' · ' + formatSize(t.size)));
      });
      body.append(optRow('Total', formatSize(all), null, {}));
    } catch (error) {
      body.replaceChildren(scopeNote('Erreur : ' + (error.message || error)));
    }
  });
}

/* ---------- Menu ⋮ de la discussion ---------- */
function openRoomMenu() {
  if (!room) return;
  optScope = room;
  const rows = () => {
    sheetOpen($('roomTitle')?.textContent || 'Discussion', body => {
      body.append(optRow('🖼️ Médias, liens et docs', '›', () => openMediaSheet()));
      body.append(optRow('⭐ Important', String(starredList().filter(i => i.conversation_id === room).length || 'Aucun'), () => openImportantSheet()));
      body.append(optRow('🎨 Thème de la discussion', '›', () => openThemeSheet()));
      body.append(optRow('⏱ Messages éphémères', ephemeralLabel(ephemeralFor(room)), () => openEphemeralSheet()));
      body.append(optRow('🔒 Verrouiller la discussion', isRoomLocked(room) ? 'Oui' : 'Non', async () => {
        await toggleRoomLock(room);
        rows();
      }));
      body.append(optRow('🛡️ Confidentialité avancée', advFor(room) ? 'Activée' : 'Désactivée', () => openPrivacySheet()));
      body.append(optRow('🔐 Chiffrement', '›', () => openEncryptionSheet()));
    });
  };
  rows();
}
$('roomMenu')?.addEventListener('click', openRoomMenu);

/* ---------- Page « Vous » : lignes et valeurs ---------- */
const LOOKS = [
  { id: '', name: 'Classique', bg: 'linear-gradient(160deg, #0b1a3d, #050a18)', orb: 'radial-gradient(circle at 30% 30%, #5aa8ff, #1a4fd0)' },
  { id: 'spheres', name: 'Violet sphères', bg: 'radial-gradient(120% 90% at 30% 0%, #6a1bb0, #1a0236)', orb: 'radial-gradient(circle at 30% 28%, #f6c9ff, #b04cff 50%, #5a12a0)' },
  { id: 'frost', name: 'Violet verre dépoli', bg: 'linear-gradient(160deg, #2a0b6a, #0b0224)', orb: 'linear-gradient(145deg, #b48cff, #4a1fb8)' }
];
const LOOK_KEY = 'truechat.look';
function currentLook() {
  try { return localStorage.getItem(LOOK_KEY) || ''; } catch (error) { return ''; }
}
function applyLook(id) {
  if (id) document.documentElement.dataset.look = id;
  else delete document.documentElement.dataset.look;
  try {
    if (id) localStorage.setItem(LOOK_KEY, id);
    else localStorage.removeItem(LOOK_KEY);
  } catch (error) { /* ignoré */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', id ? '#12012a' : '#050a18');
  renderSettingsRows();
}
function openLookSheet() {
  sheetOpen('Style de l’app', body => {
    body.append(scopeNote('Le style change toute l’application : barres, menus, discussions et connexion.'));
    const grid = mk('div', 'theme-grid');
    LOOKS.forEach(look => {
      const tile = mk('button', 'theme-tile' + (currentLook() === look.id ? ' sel' : ''));
      tile.type = 'button';
      tile.style.background = look.bg;
      const orb = mk('i');
      orb.style.background = look.orb;
      orb.style.borderRadius = '50%';
      tile.append(orb, mk('span', '', look.name));
      tile.addEventListener('click', () => {
        applyLook(look.id);
        openLookSheet();
      });
      grid.append(tile);
    });
    body.append(grid);
  });
}
function renderSettingsRows() {
  if ($('rvLook')) $('rvLook').textContent = LOOKS.find(look => look.id === currentLook())?.name || 'Classique';
  if ($('rvImportant')) {
    const count = starredList().length;
    $('rvImportant').textContent = count ? String(count) : 'Aucun';
  }
  if ($('rvSave')) $('rvSave').textContent = saveLabel(prefs.saveMode);
  if ($('rvEphemeral')) {
    const seconds = prefs.ephemeral.global || 0;
    $('rvEphemeral').textContent = seconds ? ephemeralLabel(seconds) : 'Non';
  }
  if ($('rvPrivacy')) $('rvPrivacy').textContent = prefs.adv.global ? 'Activée' : 'Désactivée';
  if ($('lockToggle')) $('lockToggle').checked = Boolean(prefs.lockAll);
}
const settingsRowActions = {
  setMedia: () => openMediaSheet(),
  settingsStorage: () => openStorageSheet(),
  setImportant: () => openImportantSheet(),
  setLook: () => openLookSheet(),
  setTheme: () => openThemeSheet(),
  setSave: () => openSaveSheet(),
  setEphemeral: () => openEphemeralSheet(),
  settingsPrivacy: () => openPrivacySheet(),
  setEncryption: () => openEncryptionSheet()
};
Object.entries(settingsRowActions).forEach(([id, action]) => {
  $(id)?.addEventListener('click', () => {
    optScope = null;   // depuis « Vous » : réglage général
    action();
  });
});
$('lockToggle')?.addEventListener('change', async () => {
  const wantOn = $('lockToggle').checked;
  const done = await toggleLockAll(wantOn);
  if (!done) $('lockToggle').checked = !wantOn;
  else if (wantOn) notify('Verrouillage activé : le code sera demandé au retour dans l’app.');
  renderSettingsRows();
});

/* =====================================================
   V3 — OUTILS COMMUNS
===================================================== */
function mk(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
let gdClose = null;
function glassDialog({ title, text, actions }) {
  return new Promise(resolve => {
    document.querySelector('.gdlg')?.remove();
    const overlay = mk('div', 'gdlg');
    const card = mk('div', 'gdlg-card');
    if (title) card.append(mk('h3', '', title));
    if (text) card.append(mk('p', '', text));
    let done = false;
    const close = value => {
      if (done) return;
      done = true;
      gdClose = null;
      overlay.classList.add('out');
      setTimeout(() => overlay.remove(), 190);
      resolve(value);
    };
    gdClose = close;
    actions.forEach(action => {
      const button = mk('button', 'gdlg-btn' + (action.danger ? ' danger' : ''), action.label);
      button.type = 'button';
      button.addEventListener('click', () => close(action.value));
      card.append(button);
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(null);
    });
    overlay.append(card);
    document.body.append(overlay);
  });
}
const glassConfirm = (text, okLabel = 'Supprimer', title = 'Confirmation') =>
  glassDialog({
    title,
    text,
    actions: [{ label: okLabel, value: true, danger: true }, { label: 'Annuler', value: false }]
  }).then(value => value === true);
const isNetworkError = error =>
  !navigator.onLine ||
  /failed to fetch|networkerror|load failed|network request failed|fetch failed/i
    .test(String(error?.message || error));

/* Écran stable : pas de zoom au pincement (en plus de la balise viewport et du CSS) */
['gesturestart', 'gesturechange', 'gestureend'].forEach(name =>
  document.addEventListener(name, event => event.preventDefault()));
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });
document.addEventListener('wheel', event => {
  if (event.ctrlKey) event.preventDefault();
}, { passive: false });

/* =====================================================
   V3 — HORS-LIGNE : cache local + file d'attente d'envoi
===================================================== */
const cacheKey = name => 'tc.cache.' + name + '.' + (me?.id || 'anon');
function cacheSet(name, value) {
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify(value));
  } catch (error) {
    /* stockage plein : on ignore */
  }
}
function cacheGet(name) {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(name)) || 'null');
  } catch (error) {
    return null;
  }
}
function cachePushMsg(roomId, message) {
  if (!message?.id || !roomId || !me) return;
  const list = cacheGet('msgs.' + roomId) || [];
  if (list.some(item => item.id === message.id)) return;
  list.push(message);
  cacheSet('msgs.' + roomId, list.slice(-150));
}
let prefetchAt = 0;
async function prefetchMessages() {
  if (!db || !me || !navigator.onLine || Date.now() - prefetchAt < 120000) return;
  prefetchAt = Date.now();
  for (const row of chatRows.slice(0, 20)) {
    try {
      const { data, error } = await db.from('messages').select('*')
        .eq('conversation_id', row.id).order('created_at', { ascending: false }).limit(100);
      if (!error && data) cacheSet('msgs.' + row.id, [...data].reverse());
    } catch (error) { /* hors-ligne : on garde l'ancien cache */ }
  }
}
/* URL signée : on garde la dernière pour pouvoir réafficher l'image hors-ligne (le SW la sert depuis son cache) */
async function signUrlOffline(bucket, path) {
  const key = 'tc.sign.' + bucket + '/' + path;
  try {
    const { data, error } = await db.storage.from(bucket).createSignedUrl(path, 3600);
    if (!error && data?.signedUrl) {
      try { localStorage.setItem(key, data.signedUrl); } catch (e) { /* plein */ }
      return data.signedUrl;
    }
  } catch (error) { /* hors-ligne */ }
  try { return localStorage.getItem(key); } catch (error) { return null; }
}
function storedUser() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (/^sb-.*-auth-token$/.test(key)) {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        if (value?.user?.id) return value.user;
      }
    }
  } catch (error) {
    /* ignore */
  }
  return null;
}
function idb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('truechat', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('outbox', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function outboxWrite(fn) {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('outbox', 'readwrite');
    fn(tx.objectStore('outbox'));
    tx.oncomplete = () => { database.close(); resolve(); };
    tx.onerror = () => { database.close(); reject(tx.error); };
  });
}
const outboxAdd = job => outboxWrite(store => store.put(job));
const outboxDelete = id => outboxWrite(store => store.delete(id));
async function outboxAll() {
  const database = await idb();
  return new Promise((resolve, reject) => {
    const request = database.transaction('outbox').objectStore('outbox').getAll();
    request.onsuccess = () => { database.close(); resolve(request.result || []); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}
/* Envoie un message (texte ou média). Lance une erreur si la base refuse. */
async function deliverJob(job) {
  let mediaPath = null;
  if (job.blob) {
    mediaPath = job.room + '/' + crypto.randomUUID() + '.' + (job.ext || 'bin');
    const { error: uploadError } = await db.storage
      .from('media')
      .upload(mediaPath, job.blob, { contentType: job.mime || 'application/octet-stream', upsert: false });
    if (uploadError) throw uploadError;
  }
  const { data, error } = await db.from('messages').insert({
    conversation_id: job.room,
    sender_id: me.id,
    content: job.content || null,
    type: job.type,
    media_path: mediaPath,
    media_name: job.mediaName || null,
    media_size: job.blob ? job.blob.size : null,
    ...expiryFields(job.room)
  }).select('*');
  if (error) {
    if (mediaPath) await db.storage.from('media').remove([mediaPath]);
    throw error;
  }
  return data?.[0] || null;
}
/* Envoie maintenant ; sans réseau, garde le message et l'enverra plus tard. */
async function sendJob(job, tempBubble) {
  job.id = crypto.randomUUID();
  job.userId = me.id;
  job.createdAt = Date.now();
  job.attempts = 0;
  if (tempBubble) tempBubble.dataset.pending = job.id;
  try {
    job.sentRow = await deliverJob(job);
    return 'sent';
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    delete job.sentRow;
    await outboxAdd(job);
    if (tempBubble) {
      const note = tempBubble.querySelector('small');
      if (note) note.textContent = '⏳ en attente de réseau';
      $('messages').scrollTop = $('messages').scrollHeight;
    } else if (room === job.room) {
      $('messages')?.append(pendingBubble(job));
      $('messages').scrollTop = $('messages').scrollHeight;
    }
    return 'queued';
  }
}
function pendingBubble(job) {
  const bubble = mk('div', 'bubble mine pending');
  bubble.dataset.pending = job.id;
  const label = job.content ||
    ({ image: '📷 Photo', video: '🎥 Vidéo', voice: '🎤 Message vocal', file: '📄 ' + (job.mediaName || 'Fichier') }[job.type] || 'Message');
  bubble.append(mk('div', '', label), mk('small', '', '⏳ en attente de réseau'));
  return bubble;
}
async function renderPendingForRoom() {
  if (!room || !me) return;
  try {
    const jobs = (await outboxAll())
      .filter(job => job.userId === me.id && job.room === room)
      .sort((a, b) => a.createdAt - b.createdAt);
    jobs.forEach(job => $('messages')?.append(pendingBubble(job)));
  } catch (error) {
    /* IndexedDB indisponible */
  }
}
function updateNetBanner() {
  const banner = $('netBanner');
  if (banner) banner.hidden = true;   // bandeau « Hors ligne » désactivé
}
let flushing = false;
async function flushOutbox() {
  if (flushing || !me || !db || !navigator.onLine) return;
  flushing = true;
  try {
    const jobs = (await outboxAll())
      .filter(job => job.userId === me.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    let sent = 0;
    for (const job of jobs) {
      try {
        await deliverJob(job);
        await outboxDelete(job.id);
        sent += 1;
      } catch (error) {
        if (isNetworkError(error)) break;
        job.attempts = (job.attempts || 0) + 1;
        if (job.attempts >= 3) {
          await outboxDelete(job.id);
          notify('Un message n’a pas pu être envoyé : ' + (error.message || error));
        } else {
          await outboxAdd(job);
        }
      }
    }
    if (sent) {
      if (room) await loadMessages().catch(() => {});
      await loadChats().catch(() => {});
    }
  } catch (error) {
    console.warn('Envoi différé:', error);
  } finally {
    flushing = false;
  }
}
window.addEventListener('online', () => {
  updateNetBanner();
  flushOutbox();
  loadChats().catch(() => {});
});
window.addEventListener('offline', updateNetBanner);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) flushOutbox();
});
setInterval(flushOutbox, 20000);
updateNetBanner();

/* =====================================================
   V3 — SONS DE NOTIFICATION (app ouverte) + BANNIÈRE
===================================================== */
const TONES = {
  cristal: { name: 'Cristal', notes: [[1318, 0, 0.14], [1760, 0.12, 0.28]] },
  goutte: { name: 'Goutte', notes: [[660, 0, 0.1], [440, 0.09, 0.22]] },
  carillon: { name: 'Carillon', notes: [[784, 0, 0.16], [988, 0.14, 0.16], [1175, 0.28, 0.3]] },
  pop: { name: 'Pop', notes: [[520, 0, 0.06], [780, 0.05, 0.1]] },
  radar: { name: 'Radar', notes: [[600, 0, 0.12], [600, 0.2, 0.12], [900, 0.4, 0.25]] },
  none: { name: 'Aucun son', notes: [] }
};
let audioCtx = null;
function audioContext() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}
['pointerdown', 'touchstart', 'keydown'].forEach(name =>
  document.addEventListener(name, () => audioContext(), { once: true, passive: true }));
function playTone(id) {
  const tone = TONES[id];
  if (!tone || !tone.notes.length) return;
  const ctx = audioContext();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.02;
  tone.notes.forEach(([freq, at, duration]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + duration + 0.05);
  });
}
function messageAlert(kind) {
  playTone(prefs.sound?.[kind] || (kind === 'group' ? 'goutte' : 'cristal'));
  if (prefs.sound?.vibrate !== false && navigator.vibrate) navigator.vibrate([120, 60, 120]);
}
function openSoundsSheet() {
  optScope = null;
  sheetOpen('Sons de notification', body => {
    body.append(scopeNote(
      'Ces sons jouent quand l’app est ouverte. Quand elle est fermée, le téléphone utilise son propre son de notification.'
    ));
    [['person', 'Messages privés'], ['group', 'Groupes']].forEach(([kind, label]) => {
      body.append(mk('h4', 'opt-sub', label));
      Object.entries(TONES).forEach(([id, tone]) => {
        body.append(optRow(tone.name, '', () => {
          prefs.sound[kind] = id;
          savePrefs();
          playTone(id);
          openSoundsSheet();
        }, { selected: prefs.sound[kind] === id }));
      });
    });
    body.append(optRow('Vibration', prefs.sound.vibrate !== false ? 'Oui' : 'Non', () => {
      prefs.sound.vibrate = prefs.sound.vibrate === false;
      savePrefs();
      openSoundsSheet();
    }));
  });
}
let inboxChannel = null;
let inboxTimer = null;
function startInbox() {
  if (inboxChannel || !db || !me) return;
  inboxChannel = db.channel('inbox-' + me.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      payload => onIncoming(payload.new))
    .subscribe();
}
function stopInbox() {
  if (inboxChannel && db) db.removeChannel(inboxChannel);
  inboxChannel = null;
}
function showBanner(title, text, roomId) {
  const banner = $('inBanner');
  if (!banner) return;
  banner.replaceChildren(mk('b', '', title), mk('span', '', text));
  banner.hidden = false;
  banner.onclick = () => {
    banner.hidden = true;
    openRoom(roomId);
  };
  clearTimeout(showBanner.timer);
  showBanner.timer = setTimeout(() => { banner.hidden = true; }, 4500);
}
function onIncoming(message) {
  if (message && me) cachePushMsg(message.conversation_id, message);
  if (!message || !me || message.sender_id === me.id || isExpired(message)) return;
  clearTimeout(inboxTimer);
  inboxTimer = setTimeout(() => loadChats().catch(() => {}), 600);
  const watching = room === message.conversation_id && !document.hidden;
  if (watching || prefs.muted[message.conversation_id]) return;
  const row = chatRows.find(item => item.id === message.conversation_id);
  messageAlert(row?.isGroup ? 'group' : 'person');
  showBanner(
    row?.name || 'Nouveau message',
    advFor(message.conversation_id) ? 'Message masqué' : (previewOf(message).text || 'Nouveau message'),
    message.conversation_id
  );
}

/* =====================================================
   V3 — LISTE DES DISCUSSIONS : appui long, non lu, archives, favoris, listes
===================================================== */
function chatUnread(row) {
  if (prefs.unread[row.id]) return true;
  if (!row.last || row.last.sender_id === me?.id || row.last.deleted_at) return false;
  return new Date(row.last.created_at).getTime() > (prefs.lastRead[row.id] || 0);
}
function chatVisible(row) {
  const deleted = prefs.deletedRooms[row.id];
  return !(deleted && new Date(row.time || 0).getTime() <= deleted);
}
let longPressAt = 0;
function attachLongPress(el, action) {
  let timer = null;
  let x0 = 0;
  let y0 = 0;
  const cancel = () => clearTimeout(timer);
  el.addEventListener('pointerdown', event => {
    x0 = event.clientX;
    y0 = event.clientY;
    cancel();
    timer = setTimeout(() => {
      longPressAt = Date.now();
      if (navigator.vibrate) navigator.vibrate(15);
      action();
    }, 500);
  });
  el.addEventListener('pointermove', event => {
    if (Math.abs(event.clientX - x0) > 10 || Math.abs(event.clientY - y0) > 10) cancel();
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(name => el.addEventListener(name, cancel));
  el.addEventListener('contextmenu', event => {
    event.preventDefault();
    longPressAt = Date.now();
    action();
  });
}
function setChatFilter(filter) {
  chatFilter = filter;
  document.querySelectorAll('.chip[data-filter]').forEach(chip => {
    chip.classList.toggle('on', chip.dataset.filter === filter);
  });
  renderChatList();
}
function renderListChips() {
  const holder = document.querySelector('.chips');
  if (!holder) return;
  holder.querySelectorAll('.chip.dyn').forEach(chip => chip.remove());
  Object.keys(prefs.lists).forEach(name => {
    const chip = mk('button', 'chip dyn' + (chatFilter === 'list:' + name ? ' on' : ''), name);
    chip.type = 'button';
    chip.dataset.filter = 'list:' + name;
    chip.addEventListener('click', () => setChatFilter('list:' + name));
    holder.append(chip);
  });
}
function renderChatList() {
  const box = $('chats');
  if (!box) return;
  box.replaceChildren();
  const visibleRows = chatRows.filter(chatVisible);
  const groupCount = visibleRows.filter(row => row.isGroup && !prefs.archived[row.id]).length;
  if ($('groupsCount')) $('groupsCount').textContent = groupCount ? String(groupCount) : '';
  renderListChips();
  const archivedCount = visibleRows.filter(row => prefs.archived[row.id]).length;
  const archivedRow = $('archivedRow');
  if (archivedRow) {
    archivedRow.hidden = !archivedCount && chatFilter !== 'archived';
    const label = archivedRow.querySelector('.t');
    if (label) {
      label.textContent = chatFilter === 'archived'
        ? '← Retour aux discussions'
        : 'Archivées' + (archivedCount ? ' (' + archivedCount + ')' : '');
    }
  }
  const rows = visibleRows.filter(row => {
    const archived = Boolean(prefs.archived[row.id]);
    if (chatFilter === 'archived') {
      if (!archived) return false;
    } else if (archived) {
      return false;
    }
    if (chatFilter === 'groups' && !row.isGroup) return false;
    if (chatFilter === 'unread' && !chatUnread(row)) return false;
    if (chatFilter === 'favorites' && !prefs.favorites[row.id]) return false;
    if (chatFilter.startsWith('list:') &&
        !(prefs.lists[chatFilter.slice(5)] || []).includes(row.id)) return false;
    if (chatQuery && !row.name.toLowerCase().includes(chatQuery)) return false;
    if (showLockedList ? !isRoomLocked(row.id) : isRoomLocked(row.id)) return false;
    return true;
  });
  const lockedCount = chatRows.filter(row => isRoomLocked(row.id)).length;
  if (lockedCount && !chatQuery) {
    const lockRow = mk('button', 'chat-row');
    lockRow.type = 'button';
    lockRow.style.cssText = 'grid-template-columns:1fr;padding:14px 16px;font-weight:700;text-align:left;';
    lockRow.textContent = showLockedList
      ? '← Retour aux discussions'
      : '🔒 Discussions verrouillées (' + lockedCount + ')';
    lockRow.onclick = async () => {
      if (showLockedList) {
        showLockedList = false;
      } else {
        if (!(await verifyPin('Discussions verrouillées'))) return;
        showLockedList = true;
      }
      renderChatList();
    };
    box.append(lockRow);
  }
  if (!rows.length) {
    const empty = mk('p', 'empty');
    empty.textContent = chatRows.length
      ? 'Aucune discussion ne correspond.'
      : 'Aucune conversation. Appuyez sur + pour trouver une personne par son numéro ou son nom d’utilisateur.';
    box.append(empty);
    return;
  }
  rows.forEach(row => {
    const unread = chatUnread(row);
    const item = mk('button', 'chat-row' + (unread ? ' unread' : ''));
    item.type = 'button';
    const avatar = mk('span', 'avatar');
    setAvatar(avatar, row.avatarUrl, row.name);
    const name = mk('span', 'name', row.name + (prefs.muted[row.id] ? ' 🔕' : '') + (prefs.favorites[row.id] ? ' ♥' : ''));
    const time = mk('span', 'time', formatChatTime(row.time));
    const msg = mk('span', 'msg');
    const cleared = prefs.clearedAt[row.id] || 0;
    const last = row.last && new Date(row.last.created_at).getTime() > cleared ? row.last : null;
    const preview = previewOf(last);
    if (last && last.sender_id === me?.id && !last.deleted_at && !advFor(row.id)) {
      msg.insertAdjacentHTML('beforeend', ICON_TICK);
    }
    if (preview.voice && !advFor(row.id)) msg.insertAdjacentHTML('beforeend', ICON_MIC);
    msg.append(mk('span', 'txt', advFor(row.id) ? 'Message masqué' : preview.text));
    item.append(avatar, name, time, msg);
    if (unread) item.append(mk('i', 'unread-dot'));
    avatar.addEventListener('click', event => {
      event.stopPropagation();
      if (row.isGroup) openGroupInfo(row.id, row.name);
      else if (row.otherId) openContactProfile(row.otherId);
      else openRoom(row.id);
    });
    attachLongPress(item, () => openChatMenu(row));
    item.onclick = () => {
      if (Date.now() - longPressAt < 700) return;
      openRoom(row.id);
    };
    box.append(item);
  });
}
function openChatMenu(row) {
  optScope = row.id;
  const danger = button => {
    button.style.color = '#ff5a5a';
    return button;
  };
  const act = (label, icon, fn, isDanger) => {
    const button = optRow(label, icon, async () => {
      closeSheet();
      await fn();
      savePrefs();
      renderChatList();
    });
    return isDanger ? danger(button) : button;
  };
  const unread = chatUnread(row);
  sheetOpen(row.name, body => {
    body.append(
      act(unread ? 'Marquer comme lu' : 'Marquer comme non lu', '●', () => {
        if (unread) {
          delete prefs.unread[row.id];
          prefs.lastRead[row.id] = Date.now();
        } else {
          prefs.unread[row.id] = true;
        }
      }),
      act(prefs.archived[row.id] ? 'Désarchiver' : 'Archiver', '🗄', () => {
        if (prefs.archived[row.id]) delete prefs.archived[row.id];
        else prefs.archived[row.id] = true;
      }),
      act(prefs.muted[row.id] ? 'Réactiver le son' : 'Mode silencieux', '🔕', () => {
        if (prefs.muted[row.id]) delete prefs.muted[row.id];
        else prefs.muted[row.id] = true;
      }),
      act(isRoomLocked(row.id) ? 'Déverrouiller la discussion' : 'Verrouiller la discussion', '🔒', async () => {
        await toggleRoomLock(row.id);
      }),
      act(prefs.favorites[row.id] ? 'Retirer des favoris' : 'Ajouter aux favoris', '♥', () => {
        if (prefs.favorites[row.id]) delete prefs.favorites[row.id];
        else prefs.favorites[row.id] = true;
      })
    );
    body.append(optRow('Ajouter à la liste', '›', () => openListsSheet(row)));
    if (!row.isGroup && row.otherId) {
      body.append(act('Bloquer ' + row.name, '⛔', () => blockUser(row.otherId)));
    }
    body.append(
      act('Effacer la discussion', '✖', async () => {
        if (!(await glassConfirm('Tous les messages seront effacés sur cet appareil.', 'Effacer', 'Effacer la discussion ?'))) return;
        prefs.clearedAt[row.id] = Date.now();
        if (room === row.id) loadMessages().catch(() => {});
      }),
      act('Supprimer la discussion', '🗑', () => deleteDiscussion(row), true)
    );
  });
}
async function deleteDiscussion(row) {
  if (!(await glassConfirm(row.isGroup ? 'Vous quitterez ce groupe et il sera supprimé de votre liste.' : 'Cette discussion sera supprimée de votre liste.', 'Supprimer', row.isGroup ? 'Quitter et supprimer ?' : 'Supprimer la discussion ?'))) return;
  if (row.isGroup) {
    const { error } = await db.rpc('leave_group', { group_id: row.id });
    if (error) {
      groupRpcError(error);
      return;
    }
  }
  prefs.deletedRooms[row.id] = Date.now();
  prefs.clearedAt[row.id] = Date.now();
  savePrefs();
  notify('Discussion supprimée.');
}
async function blockUser(userId) {
  if (!(await glassConfirm('Elle ne pourra plus vous écrire.', 'Bloquer', 'Bloquer cette personne ?'))) return;
  const { error } = await db.from('blocked_users').insert({ blocker_id: me.id, blocked_id: userId });
  if (error && error.code !== '23505') {
    errorMessage(error);
    return;
  }
  notify('Personne bloquée.');
}
async function unblockUser(userId) {
  const { error } = await db.from('blocked_users').delete()
    .eq('blocker_id', me.id).eq('blocked_id', userId);
  if (error) errorMessage(error);
  else notify('Personne débloquée.');
}
function openListsSheet(row) {
  optScope = row.id;
  sheetOpen('Ajouter à la liste', body => {
    Object.keys(prefs.lists).forEach(name => {
      const inList = prefs.lists[name].includes(row.id);
      body.append(optRow(name, '', () => {
        const list = prefs.lists[name];
        prefs.lists[name] = inList ? list.filter(id => id !== row.id) : [...list, row.id];
        savePrefs();
        renderChatList();
        openListsSheet(row);
      }, { selected: inList }));
    });
    body.append(optRow('＋ Nouvelle liste', '', () => {
      const name = (prompt('Nom de la liste (ex : Famille, Travail)') || '').trim().slice(0, 20);
      if (!name || name.startsWith('list:')) return;
      prefs.lists[name] = [...new Set([...(prefs.lists[name] || []), row.id])];
      savePrefs();
      renderChatList();
      openListsSheet(row);
    }));
    Object.keys(prefs.lists).forEach(name => {
      const remove = optRow('Supprimer la liste « ' + name + ' »', '🗑', () => {
        delete prefs.lists[name];
        if (chatFilter === 'list:' + name) chatFilter = 'all';
        savePrefs();
        renderChatList();
        openListsSheet(row);
      });
      remove.style.color = '#ff5a5a';
      body.append(remove);
    });
  });
}

/* =====================================================
   V3 — RECHERCHE DE CONTACT : numéro complet ou nom d'utilisateur exact
===================================================== */
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/i;
async function findProfiles(raw) {
  const text = String(raw || '').trim();
  if (!text || !me) return [];
  const phone = isPhoneQuery(text);
  const digits = phone ? phoneDigits(text) : '';
  const username = text.replace(/^@/, '');
  if (phone && digits.length < MIN_PHONE_DIGITS) return [];
  if (!phone && !USERNAME_RE.test(username)) return [];
  const query = phone ? digits : username.toLowerCase();
  const rpc = await db.rpc('find_profile', { q: query });
  if (!rpc.error) return (rpc.data || []).filter(person => person.id !== me.id);
  if (!/could not find the function|schema cache/i.test(rpc.error.message || '')) throw rpc.error;
  // Fonction absente (SETUP-v3.sql pas encore exécuté) : recherche exacte directe
  let request = db.from('profiles').select(profileCols()).neq('id', me.id).limit(5);
  request = phone
    ? request.eq('phone', digits)
    : request.ilike('username', username.replace(/[%_\\]/g, char => '\\' + char));
  const { data, error } = await request;
  if (error) throw error;
  return data || [];
}
async function loadKnownPeople() {
  const ids = new Set();
  const { data: contacts } = await db.from('contacts').select('contact_id').eq('owner_id', me.id);
  (contacts || []).forEach(item => ids.add(item.contact_id));
  chatRows.filter(row => !row.isGroup && row.otherId).forEach(row => ids.add(row.otherId));
  ids.delete(me.id);
  if (!ids.size) return [];
  const { data, error } = await db
    .from('profiles')
    .select('id, username, full_name, avatar_url' + (HAS_PHONE ? ', phone' : ''))
    .in('id', [...ids]);
  if (error) throw error;
  return (data || []).sort((a, b) =>
    (a.full_name || a.username || '').localeCompare(b.full_name || b.username || ''));
}

/* =====================================================
   V3 — PAGE D'INFORMATIONS (contact et groupe)
===================================================== */
const infoStack = [];
let infoCurrent = null;
function iconFrom(id) {
  const svg = (typeof id === 'string' ? $(id) : id)?.querySelector('svg');
  return svg ? svg.cloneNode(true) : mk('span', 'ri');
}
function infoRow(iconId, label, value, onClick, opts = {}) {
  const button = mk('button', 'p-row');
  button.type = 'button';
  button.append(iconFrom(iconId), mk('span', 'rl', label), mk('span', 'rv', value || ''));
  if (!opts.noChevron) button.append(mk('span', 'chev', '›'));
  if (opts.danger) button.style.color = '#ff5a5a';
  button.addEventListener('click', onClick);
  return button;
}
async function openInfoPage(opts, push = true) {
  if (!db || !me) return;
  if (!opts.group && opts.userId === me.id) {
    openProfilePage();
    return;
  }
  if (push) {
    if (infoCurrent && !$('infoPage').hidden) infoStack.push(infoCurrent);
    else infoStack.length = 0;
  }
  infoCurrent = opts;
  try {
    await renderInfoPage();
  } catch (error) {
    errorMessage(error);
    return;
  }
  $show('infoPage', true);
}
function closeInfoPage() {
  if (infoStack.length) {
    const previous = infoStack.pop();
    openInfoPage(previous, false);
    return;
  }
  infoCurrent = null;
  $show('infoPage', false);
}
$('infoBack')?.addEventListener('click', closeInfoPage);
async function renderInfoPage() {
  const opts = infoCurrent;
  const body = $('infoBody');
  const isGroup = Boolean(opts.group);
  let person = null;
  let convId = opts.convId || null;
  let members = [];
  let blocked = false;
  if (isGroup) {
    try {
      const { data: rows, error } = await db.from('conversation_members').select('user_id').eq('conversation_id', convId);
      if (error) throw error;
      const ids = (rows || []).map(item => item.user_id);
      if (ids.length) {
        const result = await db.from('profiles').select(profileCols()).in('id', ids);
        if (result.error) throw result.error;
        members = result.data || [];
      }
      cacheSet('group.' + convId, members);
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      members = cacheGet('group.' + convId) || [];
    }
  } else {
    try {
      const { data, error } = await db.from('profiles').select(profileCols()).eq('id', opts.userId).maybeSingle();
      if (error) throw error;
      person = data;
      if (!person) {
        notify('Profil introuvable.');
        throw new Error('Profil introuvable.');
      }
      convId = convId || chatRows.find(row => !row.isGroup && row.otherId === person.id)?.id || null;
      opts.convId = convId;
      const check = await db.from('blocked_users').select('blocked_id')
        .eq('blocker_id', me.id).eq('blocked_id', person.id).maybeSingle();
      blocked = Boolean(check.data);
      cacheSet('person.' + opts.userId, { person, blocked, convId });
    } catch (error) {
      if (!isNetworkError(error)) throw error;
      const saved = cacheGet('person.' + opts.userId);
      if (!saved?.person) throw error;
      person = saved.person;
      blocked = saved.blocked;
      convId = convId || saved.convId || chatRows.find(row => !row.isGroup && row.otherId === person.id)?.id || null;
      opts.convId = convId;
    }
  }
  const title = isGroup ? (opts.title || 'Groupe') : (person.full_name || person.username || 'Utilisateur');
  $('infoTitle').textContent = isGroup ? 'Infos du groupe' : 'Informations';
  body.replaceChildren();

  const avatar = mk('span', 'avatar p-avatar');
  setAvatar(avatar, isGroup ? chatRows.find(row => row.id === convId)?.avatarUrl : person.avatar_url, title);
  const avatarUrl = isGroup ? null : person.avatar_url;
  if (avatarUrl) avatar.addEventListener('click', () => showPhoto(avatarUrl, title));
  const wrap = mk('div', 'pp-avatar');
  wrap.append(avatar);
  body.append(wrap, mk('h2', 'p-name', title));
  if (isGroup) {
    body.append(mk('p', 'p-user', 'Groupe · ' + members.length + ' participant' + (members.length > 1 ? 's' : '')));
  } else {
    body.append(mk('p', 'p-user', [person.phone ? formatPhone(person.phone) : '', person.username ? '@' + person.username : '']
      .filter(Boolean).join(' · ')));
    if (person.bio) body.append(mk('p', 'pf-bio', person.bio));
  }

  const actions = mk('div', 'p-actions');
  const action = (iconSource, label, fn) => {
    const button = mk('button');
    button.type = 'button';
    button.append(iconFrom(iconSource), mk('span', '', label));
    button.addEventListener('click', fn);
    actions.append(button);
  };
  action('profMessage', 'Message', async () => {
    $show('infoPage', false);
    infoStack.length = 0;
    if (convId) {
      if (room !== convId) await openRoom(convId);
    } else if (person) {
      startPrivateChat(person.id);
    }
  });
  action('profMessage', 'Partager', async () => {
    const text = isGroup ? title : title + (person.phone ? ' ' + formatPhone(person.phone) : '');
    try {
      if (navigator.share) await navigator.share({ title, text });
      else {
        await navigator.clipboard.writeText(text);
        notify('Copié.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') notify('Partage impossible.');
    }
  });
  if (convId) action('profSearch', 'Rechercher', () => openRoomSearch(convId));
  body.append(actions);

  if (convId) {
    const scope = fn => () => {
      optScope = convId;
      fn();
    };
    const group1 = mk('div', 'p-group glow');
    group1.append(
      infoRow('setMedia', 'Médias, liens et docs', '', scope(() => openMediaSheet())),
      infoRow('setImportant', 'Important',
        String(starredList().filter(item => item.conversation_id === convId).length || 'Aucun'),
        scope(() => openImportantSheet()))
    );
    const group2 = mk('div', 'p-group glow');
    group2.append(
      infoRow('settingsNotifications', 'Notifications', prefs.muted[convId] ? 'Désactivées' : 'Activées', () => {
        if (prefs.muted[convId]) delete prefs.muted[convId];
        else prefs.muted[convId] = true;
        savePrefs();
        renderInfoPage();
        renderChatList();
      }),
      infoRow('setTheme', 'Thème de la discussion', '', scope(() => openThemeSheet())),
      infoRow('setSave', 'Enregistrer (Photos)', saveLabel(prefs.saveMode), scope(() => openSaveSheet()))
    );
    const group3 = mk('div', 'p-group glow');
    const lockRow = mk('div', 'p-row static');
    lockRow.append(iconFrom($('lockToggle')?.closest('.p-row')), mk('span', 'rl', 'Verrouiller la discussion'));
    const sw = mk('label', 'switch');
    const input = mk('input');
    input.type = 'checkbox';
    input.checked = isRoomLocked(convId);
    input.addEventListener('change', async () => {
      await toggleRoomLock(convId);
      renderInfoPage();
    });
    sw.append(input, mk('i'));
    lockRow.append(sw);
    group3.append(
      infoRow('setEphemeral', 'Messages éphémères', ephemeralLabel(ephemeralFor(convId)) === 'Non' ? 'Non' : ephemeralLabel(ephemeralFor(convId)),
        scope(() => openEphemeralSheet())),
      lockRow,
      infoRow('settingsPrivacy', 'Confidentialité avancée', advFor(convId) ? 'Activée' : 'Désactivée', scope(() => openPrivacySheet())),
      infoRow('setEncryption', 'Chiffrement', '', scope(() => openEncryptionSheet()))
    );
    body.append(group1, group2, group3);
  }

  if (isGroup) {
    const list = mk('div', 'p-group glow');
    members.forEach(member => {
      const label = member.full_name || member.username || 'Utilisateur';
      const button = mk('button', 'p-row');
      button.type = 'button';
      const av = mk('span', 'avatar sm');
      setAvatar(av, member.avatar_url, label);
      button.append(av, mk('span', 'rl', label + (member.id === me.id ? ' (vous)' : '')),
        mk('span', 'rv', member.phone ? formatPhone(member.phone) : ''), mk('span', 'chev', '›'));
      button.addEventListener('click', () => openInfoPage({ userId: member.id }));
      list.append(button);
    });
    body.append(list);
    const manage = mk('div', 'p-group glow');
    manage.append(
      infoRow($('setTheme'), '➕ Ajouter des participants', '', () => openNewChat('group', convId)),
      infoRow($('setTheme'), '✏️ Renommer le groupe', '', () => renameGroup(convId, title)),
      infoRow($('setTheme'), '🚪 Quitter le groupe', '', () => leaveGroup(convId), { danger: true, noChevron: true })
    );
    body.append(manage);
  } else {
    const danger = mk('div', 'p-group glow');
    danger.append(infoRow($('settingsBlocked') || 'setTheme',
      (blocked ? 'Débloquer ' : 'Bloquer ') + title, '', async () => {
        if (blocked) await unblockUser(person.id);
        else await blockUser(person.id);
        renderInfoPage();
      }, { danger: true, noChevron: true }));
    body.append(danger);
  }
}
async function openRoomSearch(convId) {
  $show('infoPage', false);
  infoStack.length = 0;
  if (room !== convId) await openRoom(convId);
  optScope = convId;
  sheetOpen('Rechercher dans la discussion', body => {
    const input = mk('input', 'pp-input');
    input.type = 'search';
    input.placeholder = 'Rechercher un mot…';
    const results = mk('div');
    body.append(input, results);
    input.addEventListener('input', () => {
      results.replaceChildren();
      const term = input.value.trim().toLowerCase();
      if (term.length < 2) return;
      const hits = [...($('messages')?.querySelectorAll('.bubble') || [])]
        .filter(bubble => bubble.textContent.toLowerCase().includes(term))
        .slice(-30)
        .reverse();
      if (!hits.length) results.append(scopeNote('Aucun résultat.'));
      hits.forEach(bubble => {
        const text = bubble.textContent.trim();
        results.append(optRow(text.length > 80 ? text.slice(0, 80) + '…' : text, '', () => {
          closeSheet();
          bubble.scrollIntoView({ block: 'center' });
          bubble.classList.add('flash');
          setTimeout(() => bubble.classList.remove('flash'), 1800);
        }));
      });
    });
    setTimeout(() => input.focus(), 60);
  });
}

/* =====================================================
   V3 — PAGE PROFIL (Vous → Modifier)
===================================================== */
let myLinks = null;     // null = colonne « links » indisponible
let myLinksLoaded = false;
async function loadMyLinks() {
  try {
    const { data, error } = await db.from('profiles').select('links').eq('id', me.id).maybeSingle();
    myLinks = error ? null : (data?.links || '');
  } catch (error) {
    myLinks = null;
  }
  myLinksLoaded = true;
  renderProfilePage();
}
function openProfilePage() {
  if (!profile) return;
  renderProfilePage();
  $show('profilePage', true);
  if (!myLinksLoaded) loadMyLinks();
}
function closeProfilePage() {
  $show('profilePage', false);
}
$('ppBack')?.addEventListener('click', closeProfilePage);
function renderProfilePage() {
  const body = $('profilePageBody');
  if (!body || !profile) return;
  body.replaceChildren();
  const label = profile.full_name || profile.username || 'Utilisateur';
  const avatar = mk('span', 'avatar p-avatar');
  setAvatar(avatar, profile.avatar_url, label);
  if (profile.avatar_url) avatar.addEventListener('click', () => showPhoto(profile.avatar_url, label));
  const wrap = mk('div', 'pp-avatar');
  wrap.append(avatar);
  const change = mk('button', 'pp-change', 'Modifier la photo');
  change.type = 'button';
  change.addEventListener('click', () => $('avatarFile')?.click());
  body.append(wrap, change);
  const group = mk('div', 'p-group');
  const row = (name, value, placeholder, field, extra = {}) => {
    const button = mk('button', 'p-row');
    button.type = 'button';
    button.append(mk('span', 'rl', name));
    const shown = mk('span', 'rv' + (value ? '' : ' accent'), value || placeholder);
    button.append(shown, mk('span', 'chev', '›'));
    button.addEventListener('click', () => editProfileField(field, name, extra.raw ?? value, extra));
    group.append(button);
  };
  row('Nom', profile.full_name, 'Ajouter', 'full_name');
  row('Infos', profile.bio, 'Partagez une idée !', 'bio', { multiline: true });
  row('Nom de profil', profile.username, 'Ajouter', 'username');
  row('Numéro de téléphone', profile.phone ? formatPhone(profile.phone) : '', 'Ajouter', 'phone',
    { raw: profile.phone ? formatPhone(profile.phone) : '+' + currentDial() + ' ' });
  const firstLink = (myLinks || '').split('\n').filter(Boolean);
  row('Liens', firstLink.length ? firstLink[0] + (firstLink.length > 1 ? ' (+' + (firstLink.length - 1) + ')' : '') : '',
    'Ajouter des liens', 'links', { multiline: true, raw: myLinks || '' });
  body.append(group);
}
function editProfileField(field, label, current, opts = {}) {
  optScope = null;
  sheetOpen(label, body => {
    const input = mk(opts.multiline ? 'textarea' : 'input', 'pp-input');
    if (!opts.multiline) input.type = field === 'phone' ? 'tel' : 'text';
    if (field === 'links') input.placeholder = 'Un lien par ligne (https://…)';
    input.value = current || '';
    input.maxLength = field === 'links' ? 500 : field === 'bio' ? 140 : 60;
    const save = mk('button', 'pf-go', 'Enregistrer');
    save.type = 'button';
    save.addEventListener('click', () => saveProfileField(field, input.value));
    body.append(input, save);
    setTimeout(() => input.focus(), 60);
  });
}
async function saveProfileField(field, raw) {
  const value = raw.trim();
  const patch = {};
  if (field === 'full_name') {
    if (!value) {
      notify('Le nom ne peut pas être vide.');
      return;
    }
    patch.full_name = value;
  } else if (field === 'bio') {
    patch.bio = value;
  } else if (field === 'username') {
    const name = value.replace(/^@/, '').toLowerCase();
    if (!validUsername(name)) {
      notify('Nom de profil invalide : 3 à 30 caractères (lettres, chiffres, _ et .).');
      return;
    }
    patch.username = name;
  } else if (field === 'phone') {
    const phone = normalizePhone(value);
    if (!validPhone(phone)) {
      notify('Numéro invalide : ajoutez l’indicatif du pays (ex : +257 …).');
      return;
    }
    patch.phone = phone;
  } else if (field === 'links') {
    patch.links = value;
  }
  try {
    const { error } = await db.from('profiles').update(patch).eq('id', me.id);
    if (error?.code === '23505') {
      notify(field === 'phone' ? 'Ce numéro est déjà utilisé.' : 'Ce nom de profil est déjà pris.');
      return;
    }
    if (error) {
      if (field === 'links' && /links|column|schema cache/i.test(error.message || '')) {
        notify('Exécutez SETUP-v3.sql dans Supabase pour activer les liens.');
        return;
      }
      throw error;
    }
    if (field === 'links') myLinks = patch.links;
    else Object.assign(profile, patch);
    closeSheet();
    renderProfile();
    renderProfilePage();
    notify('Profil mis à jour.');
  } catch (error) {
    errorMessage(error);
  }
}

/* =====================================================
   V3 — STATUTS : éditeur façon WhatsApp
===================================================== */
const ST_BG = ['#075e54', '#1f6feb', '#8e24aa', '#d81b60', '#e65100', '#2e7d32', '#37474f', '#000000'];
const ST_PEN = ['#ffffff', '#000000', '#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2'];
const ST_EMOJI = ['😀', '😂', '😍', '🥰', '😎', '🤩', '😢', '😡', '👍', '🙏', '🔥', '🎉',
  '❤️', '💯', '✨', '🌍', '✈️', '🇺🇸', '🗽', '📍', '⭐', '💼', '📞', '✅'];
const ST_FONTS = [
  '-apple-system, system-ui, sans-serif',
  'Georgia, serif',
  'ui-monospace, Menlo, monospace',
  '"Snell Roundhand", "Brush Script MT", cursive'
];
const st = {
  kind: null, file: null, videoUrl: null, base: null, orig: null,
  items: [], tool: 'none', color: '#ffffff', penW: 10, selected: -1,
  cur: null, drag: null, bg: ST_BG[0], font: 0, sending: false
};
function stAudienceLabel() {
  const a = prefs.stAudience;
  if (a.mode === 'except') return 'Statut (' + a.ids.length + ' exclus)';
  if (a.mode === 'only') return 'Statut (' + a.ids.length + ' choisis)';
  return 'Statut (Mes contacts)';
}
function stUpdateAudience() {
  document.querySelectorAll('.st-audience').forEach(button => { button.textContent = stAudienceLabel(); });
}
async function openAudienceSheet() {
  optScope = null;
  let people = [];
  try {
    people = await loadKnownPeople();
  } catch (error) {
    console.warn(error);
  }
  const render = () => sheetOpen('Qui peut voir mon statut ?', body => {
    const a = prefs.stAudience;
    [['contacts', 'Mes contacts'], ['except', 'Mes contacts, sauf…'], ['only', 'Partager uniquement avec…']]
      .forEach(([mode, label]) => body.append(optRow(label, '', () => {
        a.mode = mode;
        if (mode === 'contacts') a.ids = [];
        savePrefs();
        stUpdateAudience();
        render();
      }, { selected: a.mode === mode })));
    if (a.mode !== 'contacts') {
      body.append(scopeNote(a.mode === 'except'
        ? 'Choisissez les personnes qui ne verront PAS votre statut.'
        : 'Choisissez les seules personnes qui verront votre statut.'));
      if (!people.length) body.append(scopeNote('Aucun contact pour le moment.'));
      people.forEach(person => {
        const row = optRow(person.full_name || person.username || 'Utilisateur', a.ids.includes(person.id) ? '✓' : '', () => {
          const index = a.ids.indexOf(person.id);
          if (index >= 0) a.ids.splice(index, 1);
          else a.ids.push(person.id);
          row.classList.toggle('sel', index < 0);
          row.querySelector('.opt-r').textContent = index < 0 ? '✓' : '';
          savePrefs();
          stUpdateAudience();
        }, { selected: a.ids.includes(person.id) });
        body.append(row);
      });
    }
    const done = mk('button', 'pf-go', 'Terminé');
    done.type = 'button';
    done.addEventListener('click', closeSheet);
    body.append(done);
  });
  render();
}
document.querySelectorAll('.st-audience').forEach(button => button.addEventListener('click', openAudienceSheet));

function openStatusStart(mode) {
  if (!me) return;
  if (mode === 'text') {
    openTextStatus();
    return;
  }
  if (mode === 'camera') {
    $('stCameraInput').click();
    return;
  }
  $show('stPicker', true);
}
function closeStatusPicker() {
  $show('stPicker', false);
}
$('stPickClose')?.addEventListener('click', closeStatusPicker);
$('stTileText')?.addEventListener('click', () => { closeStatusPicker(); openTextStatus(); });
$('stTileGallery')?.addEventListener('click', () => $('stGalleryInput').click());
$('stTileCamera')?.addEventListener('click', () => $('stCameraInput').click());
$('stTileCompo')?.addEventListener('click', () => $('stCompoInput').click());
$('stTileMusic')?.addEventListener('click', () => notify('La musique n’est pas disponible : les droits des morceaux ne le permettent pas.'));
['stGalleryInput', 'stCameraInput'].forEach(id => $(id)?.addEventListener('change', async () => {
  const file = $(id).files?.[0];
  $(id).value = '';
  if (file) await startEditorWithFile(file);
}));
$('stCompoInput')?.addEventListener('change', async () => {
  const files = [...($('stCompoInput').files || [])].slice(0, 4);
  $('stCompoInput').value = '';
  if (files.length < 2) {
    notify('Choisissez 2 à 4 photos pour la composition.');
    return;
  }
  try {
    const bitmaps = await Promise.all(files.map(loadBitmap));
    st.kind = 'image';
    st.base = composeGrid(bitmaps);
    stBeginEditor();
  } catch (error) {
    errorMessage(error);
  }
});
async function loadBitmap(file) {
  if (window.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (error) {
      /* repli ci-dessous */
    }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
    img.src = url;
  });
}
function coverDraw(ctx, bitmap, x, y, w, h) {
  const bw = bitmap.width;
  const bh = bitmap.height;
  const scale = Math.max(w / bw, h / bh);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(bitmap, (bw - sw) / 2, (bh - sh) / 2, sw, sh, x, y, w, h);
}
function composeGrid(bitmaps) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 1080, 1350);
  const gap = 6;
  const n = bitmaps.length;
  if (n === 2) {
    coverDraw(ctx, bitmaps[0], 0, 0, 537, 1350);
    coverDraw(ctx, bitmaps[1], 543, 0, 537, 1350);
  } else if (n === 3) {
    coverDraw(ctx, bitmaps[0], 0, 0, 1080, 672);
    coverDraw(ctx, bitmaps[1], 0, 672 + gap, 537, 672);
    coverDraw(ctx, bitmaps[2], 543, 672 + gap, 537, 672);
  } else {
    coverDraw(ctx, bitmaps[0], 0, 0, 537, 672);
    coverDraw(ctx, bitmaps[1], 543, 0, 537, 672);
    coverDraw(ctx, bitmaps[2], 0, 678, 537, 672);
    coverDraw(ctx, bitmaps[3], 543, 678, 537, 672);
  }
  return canvas;
}
async function startEditorWithFile(file) {
  try {
    if (file.type.startsWith('video/')) {
      if (file.size > 25 * 1024 * 1024) {
        notify('La vidéo dépasse la limite de 25 Mo.');
        return;
      }
      st.kind = 'video';
      st.file = file;
      st.base = null;
      stBeginEditor();
      return;
    }
    if (!file.type.startsWith('image/')) {
      notify('Les statuts acceptent les photos et les vidéos.');
      return;
    }
    const bitmap = await loadBitmap(file);
    const max = 1280;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    st.kind = 'image';
    st.base = canvas;
    stBeginEditor();
  } catch (error) {
    errorMessage(error);
  }
}
function copyCanvas(source) {
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext('2d').drawImage(source, 0, 0);
  return copy;
}
function stBeginEditor() {
  st.items = [];
  st.tool = 'none';
  st.selected = -1;
  st.cur = null;
  st.drag = null;
  st.orig = st.base ? copyCanvas(st.base) : null;
  $('stCaption').value = '';
  const stage = $('stStage');
  stage.replaceChildren();
  if (st.kind === 'video') {
    if (st.videoUrl) URL.revokeObjectURL(st.videoUrl);
    st.videoUrl = URL.createObjectURL(st.file);
    const video = mk('video');
    video.id = 'stVideo';
    video.src = st.videoUrl;
    video.controls = true;
    video.playsInline = true;
    video.muted = true;
    stage.append(video);
  } else {
    const canvas = mk('canvas');
    canvas.id = 'stCanvas';
    stage.append(canvas);
    bindStageCanvas(canvas);
    stRender();
  }
  $('stTools').hidden = st.kind === 'video';
  stSetTool('none');
  stUpdateAudience();
  closeStatusPicker();
  $show('stEditor', true);
}
function stClose(ask = true) {
  if (ask && st.items.length && !confirm('Abandonner ce statut ?')) return;
  $show('stEditor', false);
  if (st.videoUrl) URL.revokeObjectURL(st.videoUrl);
  st.videoUrl = null;
  st.file = null;
  st.base = null;
  st.orig = null;
  st.items = [];
  $('stStage')?.replaceChildren();
}
$('stClose')?.addEventListener('click', () => stClose());
function stDrawItem(ctx, item) {
  if (item.type === 'stroke') {
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    item.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (item.pts.length === 1) ctx.lineTo(item.pts[0][0] + 0.1, item.pts[0][1]);
    ctx.stroke();
    return;
  }
  ctx.font = '700 ' + item.size + 'px ' + ST_FONTS[0];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = item.color;
  ctx.shadowColor = 'rgba(0,0,0,.55)';
  ctx.shadowBlur = item.size / 7;
  ctx.fillText(item.text, item.x, item.y);
  ctx.shadowBlur = 0;
}
function stRender(target, forExport) {
  const canvas = target || $('stCanvas');
  if (!canvas || !st.base) return;
  canvas.width = st.base.width;
  canvas.height = st.base.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(st.base, 0, 0);
  st.items.forEach(item => stDrawItem(ctx, item));
  const item = st.items[st.selected];
  if (!forExport && item && item.type !== 'stroke') {
    ctx.font = '700 ' + item.size + 'px ' + ST_FONTS[0];
    const w = ctx.measureText(item.text).width + item.size * 0.4;
    ctx.save();
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = '#5ee9ff';
    ctx.lineWidth = Math.max(2, canvas.width / 400);
    ctx.strokeRect(item.x - w / 2, item.y - item.size * 0.7, w, item.size * 1.4);
    ctx.restore();
  }
}
function stPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return [
    (event.clientX - rect.left) * canvas.width / rect.width,
    (event.clientY - rect.top) * canvas.height / rect.height
  ];
}
function stHit(point, canvas) {
  const ctx = canvas.getContext('2d');
  for (let i = st.items.length - 1; i >= 0; i -= 1) {
    const item = st.items[i];
    if (item.type === 'stroke') continue;
    ctx.font = '700 ' + item.size + 'px ' + ST_FONTS[0];
    const w = ctx.measureText(item.text).width / 2 + item.size * 0.3;
    if (Math.abs(point[0] - item.x) <= w && Math.abs(point[1] - item.y) <= item.size * 0.75) return i;
  }
  return -1;
}
function bindStageCanvas(canvas) {
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', event => {
    canvas.setPointerCapture(event.pointerId);
    const point = stPoint(event, canvas);
    if (st.tool === 'draw') {
      st.cur = { type: 'stroke', color: st.color, w: st.penW * (canvas.width / 1000), pts: [point] };
      st.items.push(st.cur);
    } else {
      const index = stHit(point, canvas);
      st.selected = index;
      st.drag = index >= 0 ? [point[0] - st.items[index].x, point[1] - st.items[index].y] : null;
      stUpdateSelBar();
    }
    stRender();
  });
  canvas.addEventListener('pointermove', event => {
    const point = stPoint(event, canvas);
    if (st.cur) {
      st.cur.pts.push(point);
      stRender();
    } else if (st.drag && st.selected >= 0) {
      const item = st.items[st.selected];
      item.x = point[0] - st.drag[0];
      item.y = point[1] - st.drag[1];
      stRender();
    }
  });
  const release = () => {
    st.cur = null;
    st.drag = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
}
function stSetTool(tool) {
  st.tool = st.tool === tool ? 'none' : tool;
  ['stPenBar', 'stEmojiBar', 'stCropBar'].forEach(id => { $(id).hidden = true; });
  if (st.tool === 'draw') $('stPenBar').hidden = false;
  if (st.tool === 'sticker') $('stEmojiBar').hidden = false;
  if (st.tool === 'crop') $('stCropBar').hidden = false;
  document.querySelectorAll('#stTools button').forEach(button => {
    button.classList.toggle('on', button.dataset.tool === st.tool);
  });
  stUpdateSelBar();
}
function stUpdateSelBar() {
  const item = st.items[st.selected];
  const textSelected = Boolean(item && item.type !== 'stroke');
  $('stSelBar').hidden = !textSelected;
  $('stPenBar').hidden = !(st.tool === 'draw' || textSelected);
}
document.querySelectorAll('#stTools button').forEach(button => {
  button.addEventListener('click', () => {
    const tool = button.dataset.tool;
    if (!tool) return;
    if (tool === 'text') {
      stAddText();
      return;
    }
    stSetTool(tool);
  });
});
function stAddItem(text, size) {
  const item = {
    type: 'text', text, color: st.color, size: Math.round(size * st.base.width / 1000),
    x: st.base.width / 2, y: st.base.height / 2
  };
  st.items.push(item);
  st.selected = st.items.length - 1;
  stUpdateSelBar();
  stRender();
}
function stAddText() {
  optScope = null;
  sheetOpen('Ajouter du texte', body => {
    const input = mk('input', 'pp-input');
    input.type = 'text';
    input.maxLength = 80;
    input.placeholder = 'Votre texte';
    const add = mk('button', 'pf-go', 'Ajouter');
    add.type = 'button';
    add.addEventListener('click', () => {
      const text = input.value.trim();
      if (!text) return;
      closeSheet();
      stAddItem(text, 80);
    });
    body.append(input, add);
    setTimeout(() => input.focus(), 60);
  });
}
$('stPenColors')?.replaceChildren(...ST_PEN.map(color => {
  const dot = mk('button', 'st-dot');
  dot.type = 'button';
  dot.style.background = color;
  dot.addEventListener('click', () => {
    st.color = color;
    const item = st.items[st.selected];
    if (item && item.type !== 'stroke') {
      item.color = color;
      stRender();
    }
  });
  return dot;
}));
document.querySelectorAll('#stPenSizes button').forEach(button => {
  button.addEventListener('click', () => { st.penW = Number(button.dataset.w); });
});
$('stEmojiGrid')?.replaceChildren(...ST_EMOJI.map(emoji => {
  const button = mk('button', 'st-emoji', emoji);
  button.type = 'button';
  button.addEventListener('click', () => stAddItem(emoji, 150));
  return button;
}));
$('stUndo')?.addEventListener('click', () => {
  st.items.pop();
  st.selected = -1;
  stUpdateSelBar();
  stRender();
});
$('stSelBigger')?.addEventListener('click', () => {
  const item = st.items[st.selected];
  if (item) { item.size = Math.round(item.size * 1.15); stRender(); }
});
$('stSelSmaller')?.addEventListener('click', () => {
  const item = st.items[st.selected];
  if (item) { item.size = Math.max(10, Math.round(item.size / 1.15)); stRender(); }
});
$('stSelDelete')?.addEventListener('click', () => {
  if (st.selected >= 0) {
    st.items.splice(st.selected, 1);
    st.selected = -1;
    stUpdateSelBar();
    stRender();
  }
});
function stCropTo(ratio) {
  const w = st.base.width;
  const h = st.base.height;
  let cw = w;
  let ch = h;
  if (w / h > ratio) cw = Math.round(h * ratio);
  else ch = Math.round(w / ratio);
  const x = Math.round((w - cw) / 2);
  const y = Math.round((h - ch) / 2);
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  canvas.getContext('2d').drawImage(st.base, x, y, cw, ch, 0, 0, cw, ch);
  st.items.forEach(item => {
    if (item.type === 'stroke') item.pts = item.pts.map(([px, py]) => [px - x, py - y]);
    else { item.x -= x; item.y -= y; }
  });
  st.base = canvas;
  stRender();
}
function stRotate() {
  const w = st.base.width;
  const h = st.base.height;
  const canvas = document.createElement('canvas');
  canvas.width = h;
  canvas.height = w;
  const ctx = canvas.getContext('2d');
  ctx.translate(h, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(st.base, 0, 0);
  st.items.forEach(item => {
    if (item.type === 'stroke') item.pts = item.pts.map(([px, py]) => [h - py, px]);
    else { const nx = h - item.y; item.y = item.x; item.x = nx; }
  });
  st.base = canvas;
  stRender();
}
document.querySelectorAll('#stCropBar button').forEach(button => {
  button.addEventListener('click', () => {
    if (!st.base) return;
    const mode = button.dataset.crop;
    if (mode === 'rotate') stRotate();
    else if (mode === 'reset') {
      if (st.items.length && !confirm('Annuler toutes les modifications ?')) return;
      st.base = copyCanvas(st.orig);
      st.items = [];
      st.selected = -1;
      stRender();
    } else {
      const [a, b] = mode.split(':').map(Number);
      stCropTo(a / b);
    }
  });
});
async function publishStatus({ type, blob, mime, ext, content, bg }) {
  if (!me) throw new Error('Non connecté.');
  if (blob && blob.size > 25 * 1024 * 1024) throw new Error('Le fichier dépasse la limite de 25 Mo.');
  let mediaPath = null;
  if (blob) {
    mediaPath = me.id + '/' + crypto.randomUUID() + '.' + ext;
    const { error: uploadError } = await db.storage
      .from('statuses').upload(mediaPath, blob, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;
  }
  const audience = prefs.stAudience;
  const base = {
    user_id: me.id,
    type,
    content: content || null,
    media_path: mediaPath,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  };
  const extra = {
    ...(bg ? { bg } : {}),
    audience: audience.mode,
    audience_ids: audience.mode === 'contacts' ? [] : audience.ids
  };
  let { error } = await db.from('statuses').insert({ ...base, ...extra });
  let degraded = false;
  if (error && /audience|bg|column|schema cache/i.test(error.message || '')) {
    if (audience.mode !== 'contacts') {
      error = new Error('Audience indisponible : exécutez SETUP-v3.sql dans Supabase, puis réessayez.');
    } else {
      ({ error } = await db.from('statuses').insert(base));
      degraded = !error;
    }
  }
  if (error) {
    if (mediaPath) await db.storage.from('statuses').remove([mediaPath]);
    throw error;
  }
  return degraded;
}
async function stSend() {
  if (st.sending) return;
  st.sending = true;
  const button = $('stSend');
  button.disabled = true;
  try {
    const caption = $('stCaption').value.trim();
    let degraded = false;
    if (st.kind === 'video') {
      const ext = (st.file.name.split('.').pop() || 'mp4').toLowerCase();
      degraded = await publishStatus({ type: 'video', blob: st.file, mime: st.file.type, ext, content: caption });
    } else {
      const canvas = document.createElement('canvas');
      stRender(canvas, true);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
      if (!blob) throw new Error('Image impossible à préparer.');
      degraded = await publishStatus({ type: 'image', blob, mime: 'image/jpeg', ext: 'jpg', content: caption });
    }
    stClose(false);
    await loadStatuses();
    notify(degraded
      ? 'Statut publié. Exécutez SETUP-v3.sql pour activer l’audience.'
      : 'Statut publié pour 24 heures.');
  } catch (error) {
    errorMessage(error);
  } finally {
    st.sending = false;
    button.disabled = false;
  }
}
$('stSend')?.addEventListener('click', stSend);

/* ---------- Statut texte ---------- */
function applyTextStatusLook() {
  $('stText').style.background = st.bg;
  $('stTextArea').style.fontFamily = ST_FONTS[st.font];
}
function openTextStatus() {
  st.kind = 'text';
  st.bg = ST_BG[Math.floor(Math.random() * ST_BG.length)];
  st.font = 0;
  $('stTextArea').value = '';
  applyTextStatusLook();
  stUpdateAudience();
  $show('stText', true);
  setTimeout(() => $('stTextArea').focus(), 80);
}
function closeTextStatus() {
  $show('stText', false);
  $('stTextArea').blur();
}
$('stTextClose')?.addEventListener('click', closeTextStatus);
$('stTextBg')?.addEventListener('click', () => {
  st.bg = ST_BG[(ST_BG.indexOf(st.bg) + 1) % ST_BG.length];
  applyTextStatusLook();
});
$('stTextFont')?.addEventListener('click', () => {
  st.font = (st.font + 1) % ST_FONTS.length;
  applyTextStatusLook();
});
$('stTextSend')?.addEventListener('click', async () => {
  const text = $('stTextArea').value.trim();
  if (!text) {
    notify('Écrivez votre statut.');
    return;
  }
  const button = $('stTextSend');
  button.disabled = true;
  try {
    const degraded = await publishStatus({ type: 'text', content: text, bg: st.bg });
    closeTextStatus();
    await loadStatuses();
    notify(degraded
      ? 'Statut publié. Exécutez SETUP-v3.sql pour activer couleur et audience.'
      : 'Statut publié pour 24 heures.');
  } catch (error) {
    errorMessage(error);
  } finally {
    button.disabled = false;
  }
});

/* =====================================================
   V3 — INVITER DES AMIS, INSTALLER L'APPLICATION
===================================================== */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstall = event;
});
window.addEventListener('appinstalled', () => { deferredInstall = null; });
const appLink = () => location.origin + location.pathname.replace(/index\.html$/, '');
async function inviteFriends() {
  const url = appLink();
  if (navigator.share) {
    try {
      await navigator.share({ title: 'TRUE CHAT', text: 'Rejoins-moi sur TRUE CHAT', url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText('Rejoins-moi sur TRUE CHAT : ' + url);
    notify('Lien copié : ' + url);
  } catch (error) {
    prompt('Copiez ce lien :', url);
  }
}
function openInstallSheet() {
  optScope = null;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
  sheetOpen('Installer l’application', body => {
    if (standalone) {
      body.append(scopeNote('✅ L’application est déjà installée sur cet appareil.'));
    } else if (deferredInstall) {
      const install = mk('button', 'pf-go', 'Installer maintenant');
      install.type = 'button';
      install.addEventListener('click', async () => {
        deferredInstall.prompt();
        await deferredInstall.userChoice.catch(() => {});
        deferredInstall = null;
        closeSheet();
      });
      body.append(install);
    } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      body.append(scopeNote('iPhone : ouvrez ce lien dans Safari, touchez Partager, puis « Sur l’écran d’accueil ».'));
    } else {
      body.append(scopeNote('Android : menu ⋮ du navigateur, puis « Installer l’application » (ou « Ajouter à l’écran d’accueil »).'));
    }
    body.append(optRow('Envoyer le lien à un ami', '›', inviteFriends));
    body.append(scopeNote(
      'Une fois installée, l’app s’ouvre sans le navigateur, garde votre connexion et affiche vos discussions même sans réseau. ' +
      'Les messages écrits hors ligne partent automatiquement au retour du réseau.'
    ));
    body.append(scopeNote(
      'Pour partager l’app par Xender ou Bluetooth sur Android, il faut un fichier APK : voir le README (PWABuilder).'
    ));
  });
}
$('setSounds')?.addEventListener('click', openSoundsSheet);
$('setInvite')?.addEventListener('click', inviteFriends);
$('setInstall')?.addEventListener('click', openInstallSheet);
$('ncInvite')?.addEventListener('click', inviteFriends);

/* =====================================================
   RETOUR PAR GLISSEMENT (depuis le bord gauche), UNE ÉTAPE À LA FOIS
   statut ouvert → fermé ; discussion → liste ; page « Vous »/autre onglet → Discussions ;
   feuille ouverte → fermée ; liste verrouillée → liste normale
===================================================== */
const SWIPE_EDGE = 40;
const swipe = { on: false, locked: false, x0: 0, y0: 0, dx: 0, t0: 0, layer: null, endAt: 0 };
const isShown = id => {
  const el = $(id);
  return Boolean(el) && !el.hidden;
};
function backLayer() {
  if (isShown('lockScreen')) return null;
  const dlg = document.querySelector('.gdlg-card');
  if (dlg) return { el: dlg, back: () => gdClose?.(null) };
  if ($('photoView')) return { el: $('photoView'), back: closePhoto };
  if (isShown('pinSheet')) return { el: $('pinForm'), back: () => closePin(null) };
  if (isShown('optSheet')) return { el: $('optSheet').querySelector('.sheet-card'), back: closeSheet };
  if (isShown('stText')) return { el: $('stText'), back: closeTextStatus };
  if (isShown('stEditor')) return { el: $('stEditor'), back: () => stClose(true) };
  if (isShown('stPicker')) return { el: $('stPicker'), back: closeStatusPicker };
  if (isShown('statusViewer')) return { el: $('statusViewer'), back: closeStatusViewer };
  if (isShown('statusComposer')) return { el: $('statusComposer').querySelector('.sheet-card'), back: closeStatusComposer };
  if (isShown('newChat')) return { el: $('newChat').querySelector('.nc-card'), back: closeNewChat };
  if (isShown('profilePage')) return { el: $('profilePage'), back: closeProfilePage };
  if (isShown('infoPage')) return { el: $('infoPage'), back: closeInfoPage };
  if (isShown('room')) return { el: $('room'), behind: $('home'), back: () => $('back')?.click() };
  if (isShown('home')) {
    if (currentTab === 'chats' && showLockedList) {
      return { el: $('chats'), back: () => { showLockedList = false; renderChatList(); } };
    }
    if (currentTab !== 'chats') {
      const el = $(tabTargets[currentTab]);
      if (el) return { el, back: () => showTab('chats') };
    }
  }
  return null;
}
function resetLayer(layer) {
  const el = layer.el;
  ['transform', 'transition', 'willChange', 'position', 'inset', 'zIndex', 'boxShadow', 'visibility', 'opacity']
    .forEach(name => { el.style[name] = ''; });
  if (layer.behind) layer.behind.style.opacity = '';
}
function beginDrag() {
  const { el, behind } = swipe.layer;
  el.style.transition = 'none';
  el.style.willChange = 'transform';
  el.style.boxShadow = '-10px 0 30px rgba(0,0,0,.45)';
  if (behind) {
    behind.hidden = false;
    el.style.position = 'fixed';
    el.style.inset = '0';
    el.style.zIndex = '60';
  }
}
function moveDrag() {
  const { el, behind } = swipe.layer;
  const progress = Math.min(1, swipe.dx / window.innerWidth);
  el.style.transform = 'translateX(' + swipe.dx + 'px)';
  if (behind) behind.style.opacity = String(0.4 + 0.6 * progress);
  else el.style.opacity = String(1 - progress * 0.4);
}
function endSwipe(event) {
  if (!swipe.on) return;
  swipe.on = false;
  if (!swipe.locked) return;
  swipe.endAt = Date.now();
  const layer = swipe.layer;
  const el = layer.el;
  const speed = swipe.dx / Math.max(1, Date.now() - swipe.t0);
  const done = event.type !== 'touchcancel' &&
    (swipe.dx > window.innerWidth * 0.35 || (speed > 0.5 && swipe.dx > 60));
  el.style.transition = 'transform .22s ease-out, opacity .22s';
  if (done) {
    el.style.transform = 'translateX(100%)';
    setTimeout(() => {
      el.style.visibility = 'hidden';
      layer.back();
      setTimeout(() => resetLayer(layer), 350);
    }, 230);
  } else {
    el.style.transform = 'translateX(0)';
    el.style.opacity = '';
    setTimeout(() => {
      resetLayer(layer);
      if (layer.behind && isShown('room')) layer.behind.hidden = true;
    }, 240);
  }
}
document.addEventListener('touchstart', event => {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  if (touch.clientX > SWIPE_EDGE) return;
  const layer = backLayer();
  if (!layer?.el) return;
  Object.assign(swipe, { on: true, locked: false, x0: touch.clientX, y0: touch.clientY, dx: 0, t0: Date.now(), layer });
}, { passive: true });
document.addEventListener('touchmove', event => {
  if (!swipe.on) return;
  const touch = event.touches[0];
  const dx = touch.clientX - swipe.x0;
  const dy = touch.clientY - swipe.y0;
  if (!swipe.locked) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      swipe.on = false;
      return;
    }
    if (dx > 10 && dx > Math.abs(dy) * 1.5) {
      swipe.locked = true;
      beginDrag();
    } else {
      return;
    }
  }
  event.preventDefault();
  swipe.dx = Math.max(0, dx);
  moveDrag();
}, { passive: false });
document.addEventListener('touchend', endSwipe);
document.addEventListener('touchcancel', endSwipe);
// évite qu'un clic fantôme se déclenche juste après le glissement
document.addEventListener('click', event => {
  if (Date.now() - swipe.endAt < 400) {
    event.stopPropagation();
    event.preventDefault();
  }
}, true);
/* =====================================================
   NOTIFICATIONS PUSH (messages quand l'app est fermée)
===================================================== */
const pushSupported =
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('Service worker:', error);
    return null;
  }
}
registerServiceWorker();

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

async function savePushSubscription(subscription) {
  const json = subscription.toJSON();
  const { error } = await db.from('push_subscriptions').upsert(
    {
      user_id: me.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

async function getPushSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return (await registration.pushManager.getSubscription()) ||
    registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey)
    });
}

// À appeler depuis un geste de l'utilisateur (demande d'autorisation)
async function enablePush() {
  if (!me || !db) return;
  if (!pushSupported) {
    notify("Notifications ntizishoboka hano. Kuri iPhone, banza ushyire app kuri Home Screen.");
    return;
  }
  if (!cfg?.vapidPublicKey) {
    notify('Clé VAPID manquante dans la configuration (vapidPublicKey).');
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      notify("Uruhusha rwa notifications ntirwatanzwe.");
      return;
    }
    await savePushSubscription(await getPushSubscription());
    notify("Notifications zifunguwe.");
  } catch (error) {
    errorMessage(error);
  }
}

// Au démarrage : si l'autorisation existe déjà, on resynchronise sans rien demander
async function syncPushSubscription() {
  if (!pushSupported || !me || !cfg?.vapidPublicKey) return;
  if (Notification.permission !== 'granted') return;
  await savePushSubscription(await getPushSubscription());
}
/* =====================================================
   PARAMÈTRES
===================================================== */
function showSettings() {
  renderProfile();
  renderSettingsRows();
  loadProfileStats().catch(error => console.warn(error));
}
function formatSize(bytes) {
  const mb = bytes / 1048576;
  return mb.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
}
async function loadProfileStats() {
  if (!me || !db) return;
  const { data, error } = await db
    .from('messages')
    .select('media_size')
    .eq('sender_id', me.id)
    .not('media_path', 'is', null)
    .limit(1000);
  if (error) throw error;
  const rows = data || [];
  if ($('statMedia')) $('statMedia').textContent = String(rows.length);
  if ($('statStorage')) {
    $('statStorage').textContent =
      formatSize(rows.reduce((sum, row) => sum + (row.media_size || 0), 0));
  }
}
/* ---------- Photo de profil ---------- */
async function resizeImage(file, size) {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').drawImage(
      bitmap,
      (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
      0, 0, size, size
    );
    const blob = await new Promise(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob || file;
  } catch (error) {
    return file;
  }
}
$('profAvatarBtn')?.addEventListener('click', openProfilePage);
$('avatarFile')?.addEventListener('change', async () => {
  const file = $('avatarFile').files?.[0];
  $('avatarFile').value = '';
  if (!file || !me || !db) return;
  if (!file.type.startsWith('image/')) {
    notify('Choisissez une image.');
    return;
  }
  try {
    notify('Envoi de la photo…');
    const blob = await resizeImage(file, 512);
    const path = me.id + '/' + crypto.randomUUID() + '.jpg';
    const { error: uploadError } = await db.storage
      .from('avatars')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const { data: pub } = db.storage.from('avatars').getPublicUrl(path);
    const { data, error } = await db
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', me.id)
      .select(profileCols())
      .single();
    if (error) throw error;
    profile = data;
    renderProfile();
    notify('Photo de profil mise à jour.');
  } catch (error) {
    errorMessage(error);
  }
});
$('profBack')?.addEventListener('click', () => showTab('chats'));
$('profMessage')?.addEventListener('click', () => {
  if (me) startPrivateChat(me.id);
});
$('profSearch')?.addEventListener('click', () => {
  showTab('chats');
  $('findEmail')?.focus();
});
$('profLogout')?.addEventListener('click', () => $('logout')?.click());
$('settingsProfile')?.addEventListener('click', () => {
  $('editProfile')?.click();
});
$('settingsNotifications')?.addEventListener('click', () => {
  showTab('notifications');
  enablePush();
});
$('settingsBlocked')?.addEventListener('click', async () => {
  if (!me) return;
  try {
    const { data, error } = await db
      .from('blocked_users')
      .select('blocked_id')
      .eq('blocker_id', me.id);
    if (error) throw error;
    notify(
      data?.length
        ? data.length + ' utilisateur(s) bloqué(s).'
        : 'Aucun utilisateur bloqué.'
    );
  } catch (error) {
    errorMessage(error);
  }
});
/* =====================================================
   INTERFACE : MENU, FILTRES, RECHERCHE, CAMÉRA
===================================================== */
document.querySelectorAll('.chip[data-filter]').forEach(chip => {
  chip.addEventListener('click', () => setChatFilter(chip.dataset.filter));
});
$('archivedRow')?.addEventListener('click', () => {
  setChatFilter(chatFilter === 'archived' ? 'all' : 'archived');
});
$('cameraBtn')?.addEventListener('click', () => {
  showTab('status');
  openStatusStart();
});
const menuSheet = $('menuSheet');
$('menuBtn')?.addEventListener('click', event => {
  event.stopPropagation();
  if (menuSheet) menuSheet.hidden = !menuSheet.hidden;
});
menuSheet?.querySelectorAll('button').forEach(button => {
  button.addEventListener('click', () => {
    menuSheet.hidden = true;
  });
});
document.addEventListener('click', event => {
  if (menuSheet && !menuSheet.hidden && !menuSheet.contains(event.target)) {
    menuSheet.hidden = true;
  }
});
$('findEmail')?.addEventListener('input', () => {
  chatQuery = $('findEmail').value.trim().toLowerCase();
  renderChatList();
  if (!chatQuery) $('found')?.replaceChildren();
});
/* =====================================================
   ANIMATIONS : BARRE DU BAS ET LUEUR GLASS
===================================================== */
function positionNav(force) {
  const nav = document.querySelector('nav');
  const active = nav?.querySelector('button.active');
  if (!nav || !active || !nav.offsetWidth) return;
  const x = active.offsetLeft + active.offsetWidth / 2;
  nav.style.setProperty('--nx', x + 'px');
  const holder = $('navBubbleIcon');
  const bubble = $('navBubble');
  const icon = active.querySelector('svg, .me');
  if (holder && bubble && icon &&
      (force || holder.dataset.tab !== active.dataset.tab)) {
    const changed = holder.dataset.tab !== active.dataset.tab;
    holder.dataset.tab = active.dataset.tab;
    const copy = icon.cloneNode(true);
    copy.removeAttribute('id');
    holder.replaceChildren(copy);
    if (changed) {
      bubble.classList.remove('pop');
      void bubble.offsetWidth;
      bubble.classList.add('pop');
    }
  }
}
window.addEventListener('resize', () => positionNav());
if (window.ResizeObserver && document.querySelector('nav')) {
  new ResizeObserver(() => positionNav()).observe(document.querySelector('nav'));
}
document.addEventListener('pointermove', event => {
  const target = event.target.closest?.('.glow');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  target.style.setProperty('--mx', (event.clientX - rect.left) + 'px');
  target.style.setProperty('--my', (event.clientY - rect.top) + 'px');
});
/* =====================================================
   DÉMARRAGE
===================================================== */
if (!ready) {
  notify('Vérifiez config.js : URL et clé Publishable Supabase.');
} else {
  const { data } = db.auth.onAuthStateChange((_event, session) => {
    if (!session && _event !== 'SIGNED_OUT' && !navigator.onLine) return;
    if (_event === 'INITIAL_SESSION' && session?.user && bootedFor === session.user.id) return;
    me = session?.user || null;
    if (loginAnimating) return;
    setTimeout(() => {
      if (me) {
        initialize().catch(errorMessage);
      } else {
        profile = null;
        renderAuth();
      }
    }, 0);
  });
  authListener = data?.subscription;
  // Démarrage rapide : session déjà enregistrée sur l'appareil → on ouvre tout de suite,
  // sans attendre le réseau (en ligne ou hors-ligne). La connexion n'est demandée qu'une fois.
  const quickUser = storedUser();
  if (quickUser) {
    me = quickUser;
    bootedFor = quickUser.id;
    initialize().catch(errorMessage);
  }
  db.auth.getSession()
    .then(({ data: sessionData, error }) => {
      if (error && !isNetworkError(error)) throw error;
      const sessionUser = sessionData?.session?.user;
      if (sessionUser) {
        me = sessionUser;
        if (bootedFor === sessionUser.id) return;
        bootedFor = sessionUser.id;
        return initialize();
      }
      if (me) return;   // hors-ligne : on garde l'utilisateur enregistré
      renderAuth();
    })
    .catch(errorMessage);
  // Demande au navigateur de ne pas effacer la session (connexion gardée durablement)
  navigator.storage?.persist?.().catch(() => {});
}
