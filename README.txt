TRUE CHAT — Version configurée pour votre projet Supabase

1. Ouvrez index.html dans un hébergement web compatible (HTTPS recommandé) ou dans votre environnement de test.
2. config.js contient déjà le Project URL et la clé Publishable que vous avez fournis.
3. N'ajoutez jamais une clé secret ou service_role dans les fichiers côté client.
4. Cette version fournit une interface de départ avec inscription/connexion Supabase et une base de messagerie. Elle n'est pas encore une application complète : la recherche de contacts, la création de conversations, les médias, les statuts, les appels et les notifications doivent encore être reliés et testés avec le schéma réel de la base.
5. Les règles RLS doivent protéger toutes les tables. Une clé Publishable est prévue pour le client, mais ne remplace pas les règles RLS.
6. Pour l'inscription, configurez les URLs autorisées dans Supabase Authentication > URL Configuration selon l'adresse où vous hébergez l'app. L'adresse localhost ne suffit pas pour un site en ligne.
7. Le téléchargement automatique directement vers la galerie iPhone/Android n'est pas garanti dans une simple page web; les navigateurs peuvent demander une action utilisateur. Pour un enregistrement fiable en galerie, une application native ou une intégration adaptée sera nécessaire.
8. Interface : l'écran « Discussions » reprend le style WhatsApp (barre du haut, recherche, filtres, liste, barre du bas). Les filtres « Non lues » et « Favoris » et la ligne « Archivées » sont en place visuellement mais pas encore reliés à la base.
9. Appels audio/vidéo : l'écran d'appel et la logique WebRTC sont intégrés dans index.html. Ils exigent (a) une table « calls » (id, conversation_id, caller_id, callee_id, type, status, started_at, answered_at, ended_at, duration_seconds), (b) Realtime activé sur la table « calls », (c) des règles RLS autorisant INSERT par l'appelant et SELECT/UPDATE par l'appelant et l'appelé, (d) un site en HTTPS. Les statuts utilisés sont : ringing, accepted, declined, missed, ended. Sans serveur TURN, les appels peuvent échouer sur certains réseaux mobiles.
10. Mise en service complète (TURN, notifications push, messages vocaux, SQL) : voir SETUP.md.
