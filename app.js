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
/* =====================================================
   AUTHENTIFICATION
===================================================== */
function setAuthMode(isSignup) {
  signup = isSignup;
  const button = $('authSubmit');
  const toggle = $('toggleAuth');
  const password = $('password');
  const name = $('name');
  const username = $('username');
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
  if ($('fieldUsername')) $('fieldUsername').hidden = !signup;
  if (name) name.required = signup;
  if (username) {
    username.required = signup;
    username.autocomplete = 'username';
  }
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
  const username = $('username').value.trim();
  const button = $('authSubmit');
  setBusy(button, true, 'Connexion...');
  $('auth')?.classList.remove('ok');
  loginAnimating = true;
  try {
    if (signup) {
      if (!fullName) {
        throw new Error('Entrez votre nom complet.');
      }
      if (!validUsername(username)) {
        throw new Error(
          "Le nom d'utilisateur doit contenir 3 à 30 caractères : lettres, chiffres ou _."
        );
      }
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            username
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
  const { data, error } = await db
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, last_seen')
    .eq('id', me.id)
    .maybeSingle();
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
      .select('id, username, full_name, avatar_url, bio, last_seen')
      .maybeSingle();
    if (!updateError && updated) {
      profile = updated;
    } else if (updateError) {
      console.warn('Profil non modifié:', updateError.message);
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
  if ($('profUser')) $('profUser').textContent = '@' + (profile.username || '');
  setAvatar($('profAvatar'), profile.avatar_url, label);
  setAvatar($('navAvatar'), profile.avatar_url, label);
  positionNav(true);
  if ($('welcomeUser')) {
    $('welcomeUser').textContent = 'Bienvenue, ' + label;
  }
}
$('editProfile')?.addEventListener('click', async () => {
  if (!profile) return;
  const fullName = prompt(
    'Votre nom complet :',
    profile.full_name || ''
  );
  if (fullName === null) return;
  const bio = prompt('Votre biographie :', profile.bio || '');
  if (bio === null) return;
  try {
    const { data, error } = await db
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        bio: bio.trim()
      })
      .eq('id', me.id)
      .select('id, username, full_name, avatar_url, bio, last_seen')
      .single();
    if (error) throw error;
    profile = data;
    renderProfile();
    notify('Profil mis à jour.');
  } catch (error) {
    errorMessage(error);
  }
});
/* =====================================================
   INITIALISATION
===================================================== */
async function initialize() {
  if (!db || !me) return;
  try {
    await loadProfile();
    renderAuth();
    loadPrefs();
    await probeFeatures();
    renderSettingsRows();
    if (!lockInitDone) {
      lockInitDone = true;
      showLockScreen();
    }
    await loadChats();
    await loadNotifications();
    syncPushSubscription().catch(error => console.warn('Push:', error));
  } catch (error) {
    errorMessage(error);
  }
}
function renderAuth() {
  $show('auth', !me);
  $show('home', Boolean(me));
  $show('room', false);
  $show('logout', Boolean(me));
  if (me) requestAnimationFrame(() => positionNav(true));
  if (!me) {
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
  const button = $('findUser');
  setBusy(button, true, 'Recherche...');
  try {
    /*
     * La table profiles ne contient pas nécessairement l'email.
     * La recherche se fait donc sur username et full_name.
     */
    const safeTerm = term.replace(/[,%()]/g, '');
    const { data, error } = await db
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio')
      .or(
        `username.ilike.%${safeTerm}%,full_name.ilike.%${safeTerm}%`
      )
      .neq('id', me.id)
      .limit(20);
    if (error) throw error;
    const box = $('found');
    box.replaceChildren();
    if (!data?.length) {
      box.textContent =
        'Aucun utilisateur trouvé. Essayez son nom d’utilisateur.';
      return;
    }
    data.forEach(user => {
      const card = document.createElement('div');
      card.className = 'panel';
      const title = document.createElement('p');
      title.textContent =
        (user.full_name || 'Utilisateur') +
        ' — @' + user.username;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Envoyer un message';
      button.onclick = () => startPrivateChat(user.id);
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
function renderChatList() {
  const box = $('chats');
  if (!box) return;
  box.replaceChildren();
  const groupCount = chatRows.filter(row => row.isGroup).length;
  if ($('groupsCount')) {
    $('groupsCount').textContent = groupCount ? String(groupCount) : '';
  }
  const rows = chatRows.filter(row => {
    if (chatFilter === 'groups' && !row.isGroup) return false;
    if (chatQuery && !row.name.toLowerCase().includes(chatQuery)) return false;
    if (showLockedList ? !isRoomLocked(row.id) : isRoomLocked(row.id)) return false;
    return true;
  });
  const lockedCount = chatRows.filter(row => isRoomLocked(row.id)).length;
  if (lockedCount && !chatQuery) {
    const lockRow = document.createElement('button');
    lockRow.type = 'button';
    lockRow.className = 'chat-row';
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
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = chatRows.length
      ? 'Aucune discussion ne correspond.'
      : 'Aucune conversation. Recherchez une personne pour commencer.';
    box.append(empty);
    return;
  }
  rows.forEach(row => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'chat-row';
    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    setAvatar(avatar, row.avatarUrl, row.name);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = row.name;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatChatTime(row.time);
    const msg = document.createElement('span');
    msg.className = 'msg';
    const preview = previewOf(row.last);
    if (row.last && row.last.sender_id === me?.id && !row.last.deleted_at && !advFor(row.id)) {
      msg.insertAdjacentHTML('beforeend', ICON_TICK);
    }
    if (preview.voice && !advFor(row.id)) {
      msg.insertAdjacentHTML('beforeend', ICON_MIC);
    }
    const text = document.createElement('span');
    text.className = 'txt';
    text.textContent = advFor(row.id) ? 'Message masqué' : preview.text;
    msg.append(text);
    item.append(avatar, name, time, msg);
    item.onclick = () => openRoom(row.id);
    box.append(item);
  });
}
async function loadChats() {
  if (!me || !db) return;
  if (!$('chats')) return;
  const { data: memberships, error } = await db
    .from('conversation_members')
    .select('conversation_id, role')
    .eq('user_id', me.id)
    .limit(100);
  if (error) throw error;
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
  renderChatList();
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
  const sub = opts.sub || (opts.showUser && person.username ? '@' + person.username : '');
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
  const query = $('ncSearch').value.trim().toLowerCase().replace(/^@/, '');
  const matches = person => !query ||
    (person.full_name || '').toLowerCase().includes(query) ||
    (person.username || '').toLowerCase().includes(query);
  $('ncActions').hidden = ncMode === 'group' || Boolean(query);
  const people = ncPeople.filter(matches);
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
    addTitle(people.length ? 'Résultats' : 'Aucun résultat');
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
      sections.get(letter).map(person => ncItem(person, { showUser: true }))
    ));
  });
  if (ncMode === 'group') {
    $('ncGroupGo').textContent = ncSelected.size
      ? 'Créer le groupe (' + ncSelected.size + ')'
      : 'Créer le groupe';
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
async function openNewChat(mode = 'chat') {
  if (!me || !db) return;
  ncMode = mode;
  ncSelected.clear();
  $('ncTitle').textContent = mode === 'group' ? 'Nouveau groupe' : 'Nouvelle discussion';
  $('ncGroupBar').hidden = mode !== 'group';
  $('ncGroupName').value = '';
  $('ncSearch').value = '';
  $('ncAlpha').hidden = false;
  ncBuildAlpha();
  $('newChat').hidden = false;
  document.body.style.overflow = 'hidden';
  $('ncBody').textContent = 'Chargement…';
  try {
    const { data, error } = await db
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .neq('id', me.id)
      .order('full_name', { ascending: true })
      .limit(1000);
    if (error) throw error;
    ncPeople = data || [];
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
$('ncSearch')?.addEventListener('input', ncRender);
$('ncGroup')?.addEventListener('click', () => openNewChat('group'));
$('ncContact')?.addEventListener('click', () => {
  notify('Recherchez le nom ou @nomdeprofil, puis touchez la personne.');
  $('ncSearch')?.focus();
});
$('ncCommunity')?.addEventListener('click', () => notify('Bientôt disponible.'));
$('ncBroadcast')?.addEventListener('click', () => notify('Bientôt disponible.'));
$('ncGroupBar')?.addEventListener('submit', async event => {
  event.preventDefault();
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
  $show('home', false);
  $show('room', true);
  const { data, error } = await db
    .from('conversations')
    .select(FEATURE.convExpiry ? 'id, title, is_group, ephemeral_seconds' : 'id, title, is_group')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    errorMessage(error);
    return;
  }
  if (data && FEATURE.convExpiry) roomMeta[id] = { ephemeral_seconds: data.ephemeral_seconds };
  applyRoomLook();
  const cached = chatRows.find(row => row.id === id);
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
    .order('created_at', { ascending: true })
    .limit(150);
  if (error) throw error;
  for (const message of data || []) {
    if (isExpired(message)) continue;
    await renderMessage(message, box);
  }
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
        const { data, error } = await db.storage
          .from(bucket)
          .createSignedUrl(message.media_path, 3600);
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
            const audio = document.createElement('audio');
            audio.src = data.signedUrl;
            audio.controls = true;
            audio.preload = 'metadata';
            bubble.append(audio);
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
  setBusy(button, true, '…');
  try {
    let mediaPath = null;
    let mediaName = null;
    let mediaSize = null;
    let type = 'text';
    if (file) {
      const extension = file.name.includes('.')
        ? file.name.split('.').pop().toLowerCase()
        : 'bin';
      const safeName =
        crypto.randomUUID() + '.' + extension;
      mediaPath = room + '/' + safeName;
      mediaName = file.name;
      mediaSize = file.size;
      if (file.type.startsWith('image/')) {
        type = 'image';
      } else if (file.type.startsWith('video/')) {
        type = 'video';
      } else if (file.type.startsWith('audio/')) {
        type = 'voice';
      } else {
        type = 'file';
      }
      const { error: uploadError } = await db.storage
        .from('media')
        .upload(mediaPath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false
        });
      if (uploadError) throw uploadError;
    }
    const payload = {
      conversation_id: room,
      sender_id: me.id,
      content: text || null,
      type,
      media_path: mediaPath,
      media_name: mediaName,
      media_size: mediaSize,
      ...expiryFields(room)
    };
    const { error } = await db
      .from('messages')
      .insert(payload);
    if (error) {
      /*
       * Si la base refuse le message après le téléversement,
       * on tente de supprimer le fichier qui vient d'être envoyé.
       */
      if (mediaPath) {
        await db.storage.from('media').remove([mediaPath]);
      }
      throw error;
    }
    $('messageText').value = '';
    $('attachment').value = '';
    $('selectedFile').textContent = '';
    selectedMedia = null;
    if ($('cameraInput')) $('cameraInput').value = '';
    updateComposerMode();
    await loadMessages();
  } catch (error) {
    errorMessage(error);
  } finally {
    setBusy(button, false);
  }
});
/* =====================================================
   COMPOSER : MICRO / ENVOI + MESSAGES VOCAUX (MediaRecorder)
===================================================== */
const MAX_VOICE_SECONDS = 600;
const voice = {
  active: false, recorder: null, stream: null, chunks: [],
  startedAt: 0, timer: null, send: false, room: null
};
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
  const path = voiceRoom + '/' + crypto.randomUUID() + '.' + extension;
  try {
    const { error: uploadError } = await db.storage
      .from('media')
      .upload(path, blob, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await db.from('messages').insert({
      conversation_id: voiceRoom,
      sender_id: me.id,
      content: null,
      type: 'voice',
      media_path: path,
      media_name: 'Message vocal',
      media_size: blob.size,
      ...expiryFields(voiceRoom)
    });
    if (error) {
      await db.storage.from('media').remove([path]);
      throw error;
    }
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
  const { data, error } = await db.storage
    .from('statuses')
    .createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300000 });
  return data.signedUrl;
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
  const { data, error } = await db
    .from('statuses')
    .select('id, user_id, type, content, media_path, created_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(300);
  if (error) throw error;
  const ids = [...new Set((data || []).map(item => item.user_id))];
  const names = new Map();
  if (ids.length) {
    const { data: people } = await db
      .from('profiles')
      .select('id, full_name, username')
      .in('id', ids);
    (people || []).forEach(person => {
      names.set(person.id, person.full_name || person.username || 'Utilisateur');
    });
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
      bg.style.background = avatarColor(group.userId + 'x');
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
  $('statusComposer').hidden = false;
  if (focusText) setTimeout(() => $('statusText')?.focus(), 50);
}
function closeStatusComposer() {
  $('statusComposer').hidden = true;
  $('statusText').value = '';
  $('statusMedia').value = '';
  clearStatusPreview();
}
$('statusCamera')?.addEventListener('click', () => $('statusMedia')?.click());
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
    box.style.background = avatarColor(group.userId + 'x');
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
  if (!confirm('Supprimer ce statut ?')) {
    showViewerStatus();
    return;
  }
  try {
    const { data, error } = await db.from('statuses')
      .delete().eq('id', item.id).eq('user_id', me.id).select('id');
    if (error) throw error;
    if (!data?.length) {
      throw new Error('Suppression refusée par la base (règle RLS). Exécutez la partie « suppression » de SETUP-fonctionnalites.sql.');
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
async function loadContacts() {
  if (!me) return;
  const box = $('contactsList');
  if (!box) return;
  const { data, error } = await db
    .from('contacts')
    .select('contact_id, nickname')
    .eq('owner_id', me.id);
  if (error) throw error;
  box.replaceChildren();
  if (!data?.length) {
    box.textContent = 'Aucun contact enregistré.';
    return;
  }
  for (const contact of data) {
    const { data: user, error: userError } = await db
      .from('profiles')
      .select('id, username, full_name')
      .eq('id', contact.contact_id)
      .maybeSingle();
    if (userError || !user) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'item';
    button.textContent =
      contact.nickname || user.full_name || user.username;
    button.onclick = () => startPrivateChat(user.id);
    box.append(button);
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
  hidden: {}
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
      adv: { ...prefs.adv, ...(raw.adv || {}) }
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
  if (!confirm('Supprimer ce message pour tout le monde ?')) return;
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
      throw new Error('Suppression refusée par la base (règle RLS). Exécutez la partie « suppression » de SETUP-fonctionnalites.sql.');
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
    body.append(optRow('Supprimer pour moi', '🗑', () => deleteForMe(message, bubble)));
    if (mine) {
      body.append(optRow('Supprimer pour tout le monde', '🗑', () => deleteForEveryone(message, bubble)));
    }
  });
}
function attachMessageActions(message, bubble) {
  if (!message.id) return;
  if (prefs.starred[message.id]) bubble.classList.add('starred');
  let timer = null;
  const start = event => {
    if (event.target.closest('audio, video, a, button')) return;
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
function renderSettingsRows() {
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
  if (isShown('pinSheet')) return { el: $('pinForm'), back: () => closePin(null) };
  if (isShown('optSheet')) return { el: $('optSheet').querySelector('.sheet-card'), back: closeSheet };
  if (isShown('statusViewer')) return { el: $('statusViewer'), back: closeStatusViewer };
  if (isShown('statusComposer')) return { el: $('statusComposer').querySelector('.sheet-card'), back: closeStatusComposer };
  if (isShown('newChat')) return { el: $('newChat').querySelector('.nc-card'), back: closeNewChat };
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
$('profAvatarBtn')?.addEventListener('click', () => $('avatarFile')?.click());
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
      .from('avatar')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;
    const { data: pub } = db.storage.from('avatar').getPublicUrl(path);
    const { data, error } = await db
      .from('profiles')
      .update({ avatar_url: pub.publicUrl })
      .eq('id', me.id)
      .select('id, username, full_name, avatar_url, bio, last_seen')
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
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    if (filter === 'unread' || filter === 'favorites') {
      notify('Cette option sera disponible prochainement.');
      return;
    }
    chatFilter = filter;
    document.querySelectorAll('.chip[data-filter]').forEach(other => {
      other.classList.toggle('on', other === chip);
    });
    renderChatList();
  });
});
$('archivedRow')?.addEventListener('click', () => {
  notify('Les discussions archivées seront disponibles prochainement.');
});
$('cameraBtn')?.addEventListener('click', () => {
  showTab('status');
  $('statusMedia')?.click();
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
  db.auth.getSession()
    .then(({ data: sessionData, error }) => {
      if (error) throw error;
      me = sessionData?.session?.user || null;
      if (me) {
        return initialize();
      }
      renderAuth();
    })
    .catch(errorMessage);
}
