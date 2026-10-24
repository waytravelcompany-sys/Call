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

// WEBRTC VARIABLES
let localStream = null;
let peerConnection = null;
let callChannel = null;
let isVideoCall = true;
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

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
    button.dataset.originalText = button.textContent;
    button.textContent = text || 'Patientez...';
    button.disabled = true;
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;
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
    toggle.textContent = signup
      ? 'Déjà inscrit ? Connexion'
      : 'Créer un compte';
  }
  if (name) {
    name.hidden = !signup;
    name.required = signup;
  }
  if (username) {
    username.hidden = !signup;
    username.required = signup;
    username.autocomplete = 'username';
  }
  document.querySelectorAll('label[for="name"], label[for="username"]')
    .forEach(label => { label.hidden = !signup; });
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
      await initialize();
      notify('Bienvenue sur TRUE CHAT !');
    } else {
      const { data, error } = await db.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      me = data.user;
      await initialize();
      notify('Connexion réussie.');
    }
  } catch (error) {
    errorMessage(error);
  } finally {
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
function renderProfile() {
  const box = $('myProfile');
  if (!box || !profile) return;
  box.replaceChildren();
  const name = document.createElement('p');
  name.textContent = profile.full_name || 'Utilisateur';
  const username = document.createElement('p');
  username.textContent = '@' + (profile.username || '');
  const email = document.createElement('p');
  email.textContent = me?.email || '';
  box.append(name, username, email);
  if ($('navAvatar')) {
    $('navAvatar').textContent =
      initials(profile.full_name || profile.username || '?');
  }
  if ($('welcomeUser')) {
    $('welcomeUser').textContent =
      'Bienvenue, ' + (profile.full_name || profile.username || '');
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
    await loadChats();
    await loadNotifications();
  } catch (error) {
    errorMessage(error);
  }
}
function renderAuth() {
  $show('auth', !me);
  $show('home', Boolean(me));
  $show('room', false);
  $show('logout', Boolean(me));
  if (!me) {
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
    return true;
  });
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
    avatar.style.background = avatarColor(row.name);
    avatar.textContent = initials(row.name);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = row.name;
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = formatChatTime(row.time);
    const msg = document.createElement('span');
    msg.className = 'msg';
    const preview = previewOf(row.last);
    if (row.last && row.last.sender_id === me?.id && !row.last.deleted_at) {
      msg.insertAdjacentHTML('beforeend', ICON_TICK);
    }
    if (preview.voice) {
      msg.insertAdjacentHTML('beforeend', ICON_MIC);
    }
    const text = document.createElement('span');
    text.className = 'txt';
    text.textContent = preview.text;
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
    if (!conversation.is_group) {
      try {
        const { data: others } = await db
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', id)
          .neq('user_id', me.id)
          .limit(1);
        const otherId = others?.[0]?.user_id;
        if (otherId) {
          const { data: other } = await db
            .from('profiles')
            .select('full_name, username')
            .eq('id', otherId)
            .maybeSingle();
          if (other) name = other.full_name || other.username || name;
        }
      } catch (lookupError) {
        console.warn(lookupError);
      }
    }
    let last = null;
    try {
      const { data: latest } = await db
        .from('messages')
        .select('content, type, sender_id, created_at, deleted_at')
        .eq('conversation_id', id)
        .order('created_at', { ascending: false })
        .limit(1);
      last = latest?.[0] || null;
    } catch (lastError) {
      console.warn(lastError);
    }
    return {
      id,
      name,
      isGroup: Boolean(conversation.is_group),
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
$('newConversation')?.addEventListener('click', () => {
  showTab('chats');
  $('findEmail')?.focus();
  notify('Recherchez un nom d’utilisateur pour démarrer une conversation.');
});
$('newGroup')?.addEventListener('click', async () => {
  if (!me) return;
  const title = prompt('Nom du groupe :');
  if (!title?.trim()) return;
  const membersText = prompt(
    'UUID des membres à ajouter, séparés par des virgules. Laissez vide pour créer un groupe privé.'
  );
  if (membersText === null) return;
  const memberIds = membersText
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (memberIds.some(value =>
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )) {
    notify('Un UUID de membre est invalide.');
    return;
  }
  try {
    const { data, error } = await db.rpc('create_group', {
      group_title: title.trim(),
      member_ids: memberIds
    });
    if (error) throw error;
    await loadChats();
    await openRoom(data);
  } catch (error) {
    errorMessage(error);
  }
});
/* =====================================================
   OUVRIR UNE CONVERSATION ET CHARGER LES MESSAGES
===================================================== */
async function openRoom(id) {
  room = id;
  $show('home', false);
  $show('room', true);
  const { data, error } = await db
    .from('conversations')
    .select('id, title, is_group')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    errorMessage(error);
    return;
  }
  const cached = chatRows.find(row => row.id === id);
  const roomName = cached?.name ||
    data?.title || (data?.is_group ? 'Groupe' : 'Conversation privée');
  $('roomTitle').textContent = roomName;
  if ($('roomAvatar')) {
    $('roomAvatar').textContent = initials(roomName);
    $('roomAvatar').style.background = avatarColor(roomName);
  }
  try {
    await loadMessages();
    subscribeToMessages();
  } catch (messageError) {
    errorMessage(messageError);
  }
}
$('back')?.addEventListener('click', async () => {
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
    .select(
      'id, conversation_id, sender_id, content, type, media_path, media_name, created_at, deleted_at'
    )
    .eq('conversation_id', room)
    .order('created_at', { ascending: true })
    .limit(150);
  if (error) throw error;
  for (const message of data || []) {
    await renderMessage(message, box);
  }
  box.scrollTop = box.scrollHeight;
}
async function renderMessage(message, box) {
  const bubble = document.createElement('div');
  bubble.className =
    'bubble' + (message.sender_id === me.id ? ' mine' : '');
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
          } else if (message.type === 'video') {
            const video = document.createElement('video');
            video.src = data.signedUrl;
            video.controls = true;
            video.playsInline = true;
            bubble.append(video);
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
  box.append(bubble);
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
    notify('Écrivez un message ou choisissez un fichier.');
    return;
  }
  if (file && file.size > 25 * 1024 * 1024) {
    notify('Le fichier dépasse la limite de 25 Mo.');
    return;
  }
  setBusy(button, true, 'Envoi...');
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
      media_size: mediaSize
    };
    const { error } = await db
      .from('messages')
      .insert(payload);
    if (error) {
      if (mediaPath) {
        await db.storage.from('media').remove([mediaPath]);
      }
      throw error;
    }
    $('messageText').value = '';
    $('attachment').value = '';
    $('selectedFile').textContent = '';
    selectedMedia = null;
    await loadMessages();
  } catch (error) {
    errorMessage(error);
  } finally {
    setBusy(button, false);
  }
});
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
    $('statusText').value = '';
    $('statusMedia').value = '';
    await loadStatuses();
    notify('Statut publié. Il expire après 24 heures.');
  } catch (error) {
    errorMessage(error);
  }
});
async function loadStatuses() {
  if (!me) return;
  const box = $('statuses');
  if (!box) return;
  const { data, error } = await db
    .from('statuses')
    .select('id, user_id, type, content, media_path, created_at, expires_at')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  box.replaceChildren();
  if (!data?.length) {
    box.textContent = 'Aucun statut récent.';
    return;
  }
  for (const status of data) {
    const card = document.createElement('div');
    card.className = 'panel';
    const text = document.createElement('p');
    text.textContent = status.content || 'Statut média';
    card.append(text);
    if (status.media_path) {
      const bucket = 'statuses';
      const { data: signed, error: signedError } = await db.storage
        .from(bucket)
        .createSignedUrl(status.media_path, 3600);
      if (!signedError && signed?.signedUrl) {
        if (status.type === 'image') {
          const img = document.createElement('img');
          img.src = signed.signedUrl;
          img.alt = 'Statut';
          img.style.maxWidth = '100%';
          card.append(img);
        } else if (status.type === 'video') {
          const video = document.createElement('video');
          video.src = signed.signedUrl;
          video.controls = true;
          video.playsInline = true;
          video.style.maxWidth = '100%';
          card.append(video);
        }
      }
    }
    const date = document.createElement('small');
    date.textContent = new Date(status.created_at).toLocaleString('fr-FR');
    card.append(date);
    box.append(card);
  }
}
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
  calls: 'callsSection',
  contacts: 'contactsSection',
  settings: 'settingsSection',
  notifications: 'notificationsSection'
};
const tabTitles = {
  chats: 'Discussions',
  status: 'Actus',
  calls: 'Appels',
  contacts: 'Contacts',
  settings: 'Vous',
  notifications: 'Notifications'
};
function showTab(tab) {
  currentTab = tab;
  if ($('pageTitle')) {
    $('pageTitle').textContent = tabTitles[tab] || 'TRUE CHAT';
  }
  Object.values(tabTargets).forEach(id => {
    $show(id, false);
  });
  if (tabTargets[tab]) {
    $show(tabTargets[tab], true);
  }
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  if (tab === 'status') {
    loadStatuses().catch(errorMessage);
  }
  if (tab === 'contacts') {
    loadContacts().catch(errorMessage);
  }
  if (tab === 'calls') {
    loadCalls().catch(errorMessage);
  }
  if (tab === 'settings') {
    showSettings();
  }
  if (tab === 'notifications') {
    loadNotifications().catch(errorMessage);
  }
}
document.querySelectorAll('[data-tab]').forEach(button => {
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
   APPELS : HISTORIQUE
===================================================== */
async function loadCalls() {
  if (!me) return;
  const box = $('callsList');
  if (!box) return;
  const { data, error } = await db
    .from('calls')
    .select('id, caller_id, callee_id, type, status, started_at, duration_seconds')
    .or('caller_id.eq.' + me.id + ',callee_id.eq.' + me.id)
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  box.replaceChildren();
  if (!data?.length) {
    box.textContent = 'Aucun appel enregistré.';
    return;
  }
  data.forEach(call => {
    const item = document.createElement('div');
    item.className = 'panel';
    const direction = call.caller_id === me.id
      ? 'Appel sortant'
      : 'Appel entrant';
    item.textContent =
      direction + ' — ' + call.type + ' — ' + call.status;
    box.append(item);
  });
}
/* =====================================================
   WEBRTC & SUPABASE REALTIME CALLING LOGIC
===================================================== */
async function getMediaStream(video = true) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: video,
      audio: true
    });
    const localVideo = $('localVideo');
    if (localVideo) localVideo.srcObject = localStream;
    return localStream;
  } catch (error) {
    console.error("Erreur média:", error);
    notify("Impossible d'accéder à la caméra ou au microphone.");
    throw error;
  }
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(rtcConfig);

  peerConnection.ontrack = event => {
    const remoteVideo = $('remoteVideo');
    if (remoteVideo && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate && callChannel) {
      callChannel.send({
        type: 'broadcast',
        event: 'ice-candidate',
        payload: { candidate: event.candidate, sender: me.id }
      });
    }
  };

  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

async function initiateCall(withVideo = true) {
  if (!room || !me) return;
  isVideoCall = withVideo;

  try {
    await getMediaStream(isVideoCall);
    $show('callModal', true);
    $('callModalStatus').textContent = "Appel en cours...";
    $show('acceptCallBtn', false);

    setupCallChannel();
    createPeerConnection();

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    callChannel.send({
      type: 'broadcast',
      event: 'call-offer',
      payload: { offer, sender: me.id, isVideo: isVideoCall }
    });
  } catch (error) {
    endCall();
  }
}

function setupCallChannel() {
  if (callChannel) db.removeChannel(callChannel);

  callChannel = db.channel('call-' + room)
    .on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
      if (payload.sender === me.id) return;

      $show('callModal', true);
      $('callModalStatus').textContent = "Appel entrant...";
      $show('acceptCallBtn', true);

      window.pendingOffer = payload.offer;
      isVideoCall = payload.isVideo;
    })
    .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
      if (payload.sender === me.id) return;
      if (peerConnection && payload.answer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
        $('callModalStatus').textContent = "En communication";
      }
    })
    .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
      if (payload.sender === me.id) return;
      if (peerConnection && payload.candidate) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (e) {
          console.warn("Erreur ICE Candidate:", e);
        }
      }
    })
    .on('broadcast', { event: 'end-call' }, () => {
      notify("L'appel a pris fin.");
      endCall();
    })
    .subscribe();
}

$('acceptCallBtn')?.addEventListener('click', async () => {
  try {
    $show('acceptCallBtn', false);
    $('callModalStatus').textContent = "Connexion...";

    await getMediaStream(isVideoCall);
    createPeerConnection();

    if (window.pendingOffer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(window.pendingOffer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      callChannel.send({
        type: 'broadcast',
        event: 'call-answer',
        payload: { answer, sender: me.id }
      });

      $('callModalStatus').textContent = "En communication";
    }
  } catch (error) {
    endCall();
  }
});

function endCall() {
  if (callChannel) {
    callChannel.send({
      type: 'broadcast',
      event: 'end-call',
      payload: { sender: me?.id }
    });
    db.removeChannel(callChannel);
    callChannel = null;
  }

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  $show('callModal', false);
  const localVideo = $('localVideo');
  const remoteVideo = $('remoteVideo');
  if (localVideo) localVideo.srcObject = null;
  if (remoteVideo) remoteVideo.srcObject = null;
}

$('endCallBtn')?.addEventListener('click', endCall);

$('startAudioCall')?.addEventListener('click', () => initiateCall(false));
$('startVideoCall')?.addEventListener('click', () => initiateCall(true));

/* =====================================================
   PARAMÈTRES
===================================================== */
function showSettings() {
  const box = $('settingsContent');
  if (!box) return;
  box.innerHTML = `
    <p>Compte : ${escapeHTML(me?.email || '')}</p>
    <p>Nom : ${escapeHTML(profile?.full_name || '')}</p>
    <p>Identifiant : @${escapeHTML(profile?.username || '')}</p>
    <p>Les fichiers multimédias doivent être protégés par Storage Policies.</p>
    <p>Les appels audio/vidéo en direct nécessitent une implémentation WebRTC.</p>
  `;
}
$('settingsProfile')?.addEventListener('click', () => {
  $('editProfile')?.click();
});
$('settingsNotifications')?.addEventListener('click', () => {
  showTab('notifications');
});
$('settingsPrivacy')?.addEventListener('click', () => {
  notify('La confidentialité dépend aussi des règles RLS configurées dans Supabase.');
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
$('settingsStorage')?.addEventListener('click', () => {
  notify('Les médias privés sont stockés dans Supabase Storage.');
});
$('roomMenu')?.addEventListener('click', () => {
  notify('Les options avancées de conversation seront ajoutées ensuite.');
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
   DÉMARRAGE
===================================================== */
if (!ready) {
  notify('Vérifiez config.js : URL et clé Publishable Supabase.');
} else {
  const { data } = db.auth.onAuthStateChange((_event, session) => {
    me = session?.user || null;
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
