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
    await listenForIncomingCalls();
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
  if (!me) {
    stopCallServices();
    cancelVoiceRecording();
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
  if (message.id && box.querySelector('[data-id="' + message.id + '"]')) return;
  const bubble = document.createElement('div');
  bubble.className =
    'bubble' + (message.sender_id === me.id ? ' mine' : '');
  if (message.id) bubble.dataset.id = message.id;
  box.append(bubble); // réservé tout de suite : évite les doublons et garde l'ordre
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
  if (currentCall) {
    notify("Hari umuhamagaro urimo gukorwa.");
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
      media_size: blob.size
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
   APPELS AUDIO / VIDÉO — WebRTC + Supabase Realtime
   (signalisation : broadcast ; état de l'appel : table 'calls')
===================================================== */
let localStream = null;
let peerConnection = null;
let callChannel = null;
let isVideoCall = true;
// STUN seul = repli (marche en Wi-Fi). Les identifiants TURN viennent de l'Edge
// Function « turn-credentials » (voir SETUP.md) pour que les appels passent
// aussi sur les réseaux mobiles.
const STUN_ONLY = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];
const rtcConfig = { iceServers: STUN_ONLY };
let cachedIceServers = null;
let cachedIceAt = 0;

async function loadIceServers() {
  if (cachedIceServers && Date.now() - cachedIceAt < 30 * 60 * 1000) return cachedIceServers;
  try {
    const result = await Promise.race([
      db.functions.invoke('turn-credentials'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
    ]);
    const list = result?.data?.iceServers;
    if (!result?.error && Array.isArray(list) && list.length) {
      cachedIceServers = [...list, ...STUN_ONLY];
      cachedIceAt = Date.now();
      return cachedIceServers;
    }
    console.warn('TURN indisponible, STUN seulement :', result?.error);
  } catch (error) {
    console.warn('TURN indisponible, STUN seulement :', error);
  }
  return STUN_ONLY;
}

let currentCall = null;        // ligne de la table 'calls' en cours
let callRingTimer = null;      // minuteur de 30 s (appel manqué)
let micMuted = false;
let camDisabled = false;
let incomingCallsChannel = null;
let incomingCallsUser = null;
let pendingOffer = null;       // offre reçue, en attente d'acceptation
let pendingCandidates = [];    // candidats ICE reçus trop tôt
let offerSent = false;
let wantAnswer = false;        // l'utilisateur a accepté avant l'arrivée de l'offre
let callStartedAt = null;
let callEnding = false;

const isCaller = () => Boolean(currentCall && me && currentCall.caller_id === me.id);

function sendBroadcast(event, extra = {}) {
  if (!callChannel || !me) return Promise.resolve();
  return callChannel.send({
    type: 'broadcast',
    event,
    payload: { sender: me.id, ...extra }
  });
}

/* ---------- Minuteur : appel manqué après 30 secondes ---------- */
function startRingingTimer() {
  clearRingingTimer();
  callRingTimer = setTimeout(async () => {
    if (!currentCall || currentCall.status !== 'ringing') return;
    const callId = currentCall.id;
    try {
      await db.from('calls').update({
        status: 'missed',
        ended_at: new Date().toISOString()
      }).eq('id', callId).eq('status', 'ringing');
    } catch (error) {
      console.warn('Missed call update:', error);
    }
    notify("Umuhamagaro ntiwitabiriwe (Missed call).");
    endCallUI();
  }, 30000);
}

function clearRingingTimer() {
  if (callRingTimer) {
    clearTimeout(callRingTimer);
    callRingTimer = null;
  }
}

/* ---------- 1. Microphone / caméra ---------- */
async function getMediaStream(withVideo = false) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo
    });
    const localVideo = $('localVideo');
    if (localVideo) localVideo.srcObject = localStream;
    return localStream;
  } catch (error) {
    console.error('Erreur media:', error);
    notify("Ntibyashoboka kubona uruhusha rwa kamera cyangwa microphone.");
    throw error;
  }
}

/* ---------- 2. RTCPeerConnection ---------- */
function createPeerConnection() {
  if (peerConnection) peerConnection.close();
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnection = pc;

  pc.ontrack = event => {
    const remoteVideo = $('remoteVideo');
    if (remoteVideo && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.play?.().catch(() => {});
    }
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendBroadcast('ice-candidate', { candidate: event.candidate.toJSON() })
        .catch(error => console.warn('ICE send:', error));
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc !== peerConnection) return;
    if (pc.connectionState === 'connected') {
      if (!callStartedAt) callStartedAt = Date.now();
      $('callModalStatus').textContent = "Muri kuvugana";
    } else if (pc.connectionState === 'failed') {
      notify("Guhuza byanze. Ongera ugerageze.");
      endCall();
    }
  };

  if (localStream) {
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }
}

async function flushCandidates() {
  const list = pendingCandidates;
  pendingCandidates = [];
  for (const candidate of list) {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn('Erreur ICE Candidate:', error);
    }
  }
}

/* ---------- 3. Démarrer un appel (appelant) ---------- */
async function initiateCall(withVideo = false) {
  if (!room || !me) return;
  if (currentCall) {
    notify("Hari umuhamagaro urimo gukorwa.");
    return;
  }
  isVideoCall = withVideo;
  cancelVoiceRecording();
  loadIceServers(); // préchauffe les identifiants TURN

  try {
    // A. Trouver l'autre membre de la conversation
    const { data: members, error: memberError } = await db
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', room)
      .neq('user_id', me.id)
      .limit(1);
    if (memberError) throw memberError;

    const calleeId = members?.[0]?.user_id;
    if (!calleeId) {
      notify("Ntihabonetse uwundi mukoresha muri iki kiganiro.");
      return;
    }

    // B. Micro/caméra AVANT de créer l'appel (sinon l'autre sonne pour rien)
    await getMediaStream(isVideoCall);

    // C. Écrire l'appel dans la table 'calls' (status: ringing)
    const { data: callData, error: callError } = await db
      .from('calls')
      .insert({
        conversation_id: room,
        caller_id: me.id,
        callee_id: calleeId,
        type: withVideo ? 'video' : 'audio',
        status: 'ringing'
      })
      .select()
      .single();
    if (callError) throw callError;
    currentCall = callData;
    offerSent = false;

    // D. Interface
    $show('callModal', true);
    $show('videoContainer', isVideoCall);
    $show('toggleCamBtn', isVideoCall);
    $show('acceptCallBtn', false);
    $('callModalTitle').textContent =
      $('roomTitle')?.textContent || (isVideoCall ? "Video Call" : "Audio Call");
    $('callModalStatus').textContent = "Iri kuhamagara...";
    if ($('callModalAvatar') && $('roomAvatar')) {
      $('callModalAvatar').style.background = $('roomAvatar').style.background;
      $('callModalAvatar').textContent = $('roomAvatar').textContent;
    }

    // E. Canal de signalisation : l'offre part quand l'autre est prêt
    setupCallChannel(currentCall.id);
    startRingingTimer();
  } catch (error) {
    errorMessage(error);
    if (currentCall) await endCall(); else endCallUI();
  }
}

async function sendOffer() {
  if (!currentCall || offerSent || !callChannel) return;
  offerSent = true;
  try {
    rtcConfig.iceServers = await loadIceServers();
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    await sendBroadcast('call-offer', {
      offer: { type: offer.type, sdp: offer.sdp },
      isVideo: isVideoCall,
      callId: currentCall.id
    });
  } catch (error) {
    errorMessage(error);
    endCall();
  }
}

/* ---------- 4. Canal de l'appel (Realtime Broadcast) ---------- */
function setupCallChannel(callId) {
  if (callChannel) db.removeChannel(callChannel);
  pendingOffer = null;
  pendingCandidates = [];
  wantAnswer = false;

  callChannel = db.channel('call-' + callId)
    // poignée de main : celui qui s'abonne en second déclenche l'autre
    .on('broadcast', { event: 'caller-hello' }, ({ payload }) => {
      if (payload.sender === me.id || isCaller()) return;
      sendBroadcast('callee-ready').catch(() => {});
    })
    .on('broadcast', { event: 'callee-ready' }, ({ payload }) => {
      if (payload.sender === me.id || !isCaller()) return;
      sendOffer();
    })
    .on('broadcast', { event: 'call-offer' }, ({ payload }) => {
      if (payload.sender === me.id) return;
      pendingOffer = payload.offer;
      if (typeof payload.isVideo === 'boolean') isVideoCall = payload.isVideo;
      if (wantAnswer) answerOffer().catch(error => { errorMessage(error); endCall(); });
    })
    .on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
      if (payload.sender === me.id) return;
      clearRingingTimer();
      if (peerConnection && payload.answer && peerConnection.signalingState === 'have-local-offer') {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(payload.answer));
          await flushCandidates();
          if (currentCall) currentCall.status = 'accepted';
          if (!callStartedAt) callStartedAt = Date.now();
          $('callModalStatus').textContent = "Muri kuvugana";
        } catch (error) {
          errorMessage(error);
          endCall();
        }
      }
    })
    .on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
      if (payload.sender === me.id || !payload.candidate) return;
      if (peerConnection && peerConnection.remoteDescription) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (error) {
          console.warn('Erreur ICE Candidate:', error);
        }
      } else {
        pendingCandidates.push(payload.candidate);
      }
    })
    .on('broadcast', { event: 'end-call' }, ({ payload }) => {
      if (payload.sender === me.id || !currentCall) return;
      notify("Umuhamagaro warangiye.");
      endCallUI();
    })
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return;
      sendBroadcast(isCaller() ? 'caller-hello' : 'callee-ready').catch(() => {});
    });
}

/* ---------- 5. Appels entrants (Realtime Postgres Changes) ---------- */
async function onIncomingCall(payload) {
  const call = payload.new;
  if (!call || call.status !== 'ringing') return;

  // Déjà en communication : refuser automatiquement (occupé)
  if (currentCall) {
    await db.from('calls').update({
      status: 'declined',
      ended_at: new Date().toISOString()
    }).eq('id', call.id).eq('status', 'ringing');
    return;
  }

  currentCall = call;
  isVideoCall = call.type === 'video';
  offerSent = false;
  cancelVoiceRecording();
  loadIceServers();

  $show('callModal', true);
  $show('acceptCallBtn', true);
  $show('videoContainer', isVideoCall);
  $show('toggleCamBtn', isVideoCall);
  $('callModalTitle').textContent = "Umuhamagaro";
  $('callModalStatus').textContent = isVideoCall
    ? "Umuhamagaro wa Video uje..."
    : "Umuhamagaro w'Amajwi uje...";

  setupCallChannel(call.id);
  startRingingTimer();

  // Nom et avatar de l'appelant
  const { data: callerProfile } = await db
    .from('profiles')
    .select('full_name, username, avatar_url')
    .eq('id', call.caller_id)
    .maybeSingle();
  if (!currentCall || currentCall.id !== call.id) return;

  const callerName = callerProfile?.full_name || callerProfile?.username || "Umuhamagaro";
  $('callModalTitle').textContent = callerName;
  if ($('callModalAvatar') && typeof setAvatar === 'function') {
    setAvatar($('callModalAvatar'), callerProfile?.avatar_url, callerName);
  }
}

function onCallUpdate(payload) {
  const updated = payload.new;
  if (!updated || !currentCall || currentCall.id !== updated.id) return;
  currentCall = { ...currentCall, ...updated };
  if (['ended', 'declined', 'missed'].includes(updated.status)) {
    notify("Umuhamagaro warangiye (" + updated.status + ")");
    endCallUI();
  }
}

async function listenForIncomingCalls() {
  if (!me || !db) return;
  if (incomingCallsChannel && incomingCallsUser === me.id) return; // déjà à l'écoute
  if (incomingCallsChannel) await db.removeChannel(incomingCallsChannel);
  incomingCallsUser = me.id;

  const table = { schema: 'public', table: 'calls' };
  incomingCallsChannel = db.channel('global-calls-' + me.id)
    .on('postgres_changes', { event: 'INSERT', ...table, filter: 'callee_id=eq.' + me.id }, onIncomingCall)
    .on('postgres_changes', { event: 'UPDATE', ...table, filter: 'callee_id=eq.' + me.id }, onCallUpdate)
    .on('postgres_changes', { event: 'UPDATE', ...table, filter: 'caller_id=eq.' + me.id }, onCallUpdate)
    .subscribe();
}

function stopCallServices() {
  endCallUI();
  if (incomingCallsChannel && db) db.removeChannel(incomingCallsChannel);
  incomingCallsChannel = null;
  incomingCallsUser = null;
}

/* ---------- 6. Accepter (appelé) ---------- */
async function answerOffer() {
  if (!pendingOffer || !currentCall || !callChannel) return;
  const offer = pendingOffer;
  pendingOffer = null;
  rtcConfig.iceServers = await loadIceServers();
  createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  await flushCandidates();
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  await sendBroadcast('call-answer', { answer: { type: answer.type, sdp: answer.sdp } });
  if (!callStartedAt) callStartedAt = Date.now();
  $('callModalStatus').textContent = "Muri kuvugana";
}

$('acceptCallBtn')?.addEventListener('click', async () => {
  if (!currentCall) return;
  try {
    clearRingingTimer();
    $show('acceptCallBtn', false);
    $('callModalStatus').textContent = "Guhuza...";

    await getMediaStream(isVideoCall);

    const { data, error } = await db.from('calls').update({
      status: 'accepted',
      answered_at: new Date().toISOString()
    }).eq('id', currentCall.id).eq('status', 'ringing').select();
    if (error) throw error;
    if (!data?.length) {
      notify("Umuhamagaro warangiye.");
      endCallUI();
      return;
    }
    currentCall.status = 'accepted';

    wantAnswer = true;
    if (pendingOffer) await answerOffer();
  } catch (error) {
    errorMessage(error);
    endCall();
  }
});

/* ---------- 7. Terminer / refuser ---------- */
async function endCall() {
  if (callEnding) return;
  callEnding = true;
  try {
    const call = currentCall;
    const startedAt = callStartedAt;
    clearRingingTimer();

    if (callChannel) {
      try { await sendBroadcast('end-call'); } catch (error) { console.warn(error); }
    }
    endCallUI();

    if (call && me) {
      const endStatus = (call.status === 'ringing' && call.caller_id !== me.id)
        ? 'declined'
        : 'ended';
      const patch = { status: endStatus, ended_at: new Date().toISOString() };
      if (startedAt && endStatus === 'ended') {
        patch.duration_seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      }
      const { error } = await db.from('calls').update(patch)
        .eq('id', call.id)
        .in('status', ['ringing', 'accepted']);
      if (error) console.warn('End call update:', error);
    }
  } finally {
    callEnding = false;
  }
}

function endCallUI() {
  clearRingingTimer();
  currentCall = null;
  pendingOffer = null;
  pendingCandidates = [];
  offerSent = false;
  wantAnswer = false;
  callStartedAt = null;
  micMuted = false;
  camDisabled = false;
  $('toggleMicBtn')?.classList.remove('off');
  $('toggleCamBtn')?.classList.remove('off');

  if (callChannel) {
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

/* ---------- Boutons : micro, caméra, fin, démarrage ---------- */
$('toggleMicBtn')?.addEventListener('click', () => {
  const audioTrack = localStream?.getAudioTracks()[0];
  if (!audioTrack) return;
  micMuted = !micMuted;
  audioTrack.enabled = !micMuted;
  $('toggleMicBtn').classList.toggle('off', micMuted);
  notify(micMuted ? "Microphone yazimijwe" : "Microphone yawejewe");
});

$('toggleCamBtn')?.addEventListener('click', () => {
  const videoTrack = localStream?.getVideoTracks()[0];
  if (!videoTrack) return;
  camDisabled = !camDisabled;
  videoTrack.enabled = !camDisabled;
  $('toggleCamBtn').classList.toggle('off', camDisabled);
  notify(camDisabled ? "Kamera yazimijwe" : "Kamera yawejewe");
});

$('endCallBtn')?.addEventListener('click', endCall);
$('startAudioCall')?.addEventListener('click', () => initiateCall(false));
$('startVideoCall')?.addEventListener('click', () => initiateCall(true));

/* =====================================================
   NOTIFICATIONS PUSH (appels et messages quand l'app est fermée)
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
  enablePush();
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
