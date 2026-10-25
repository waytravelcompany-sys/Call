TRUE CHAT — Version configurée pour votre projet Supabase

1. Ouvrez index.html dans un hébergement web compatible (HTTPS recommandé) ou dans votre environnement de test.
2. config.js contient déjà le Project URL et la clé Publishable que vous avez fournis.
3. N'ajoutez jamais une clé secret ou service_role dans les fichiers côté client.
4. Cette version fournit une interface de départ avec inscription/connexion Supabase et une base de messagerie. Elle n'est pas encore une application complète : la recherche de contacts, la création de conversations, les médias, les statuts, les appels et les notifications doivent encore être reliés et testés avec le schéma réel de la base.
5. Les règles RLS doivent protéger toutes les tables. Une clé Publishable est prévue pour le client, mais ne remplace pas les règles RLS.
6. Pour l'inscription, configurez les URLs autorisées dans Supabase Authentication > URL Configuration selon l'adresse où vous hébergez l'app. L'adresse localhost ne suffit pas pour un site en ligne.
7. Le téléchargement automatique directement vers la galerie iPhone/Android n'est pas garanti dans une simple page web; les navigateurs peuvent demander une action utilisateur. Pour un enregistrement fiable en galerie, une application native ou une intégration adaptée sera nécessaire.
8. Interface : l'écran « Discussions » reprend le style WhatsApp (barre du haut, recherche, filtres, liste, barre du bas). Les filtres « Non lues » et « Favoris » et la ligne « Archivées » sont en place visuellement mais pas encore reliés à la base.
9. Les appels audio/vidéo ont été retirés de l'application (boutons, écran d'appel, onglet « Appels » et code WebRTC). La table « calls » de Supabase n'est plus utilisée ; vous pouvez la supprimer.
10. Réglages de discussion (page « Vous » et menu ⋮ dans une discussion) : médias/liens/docs, important (⭐), thème, enregistrement des photos, messages éphémères, verrouillage par code PIN, confidentialité avancée, chiffrement (informations). Les préférences sont gardées sur l'appareil (localStorage). Pour que les messages éphémères disparaissent chez tout le monde, exécutez SETUP-fonctionnalites.sql dans Supabase.
11. Seul index.html est chargé par l'application (son script est intégré). app.js est une copie du même script.
12. Suppression : appui long sur un message ou un vocal → « Supprimer pour moi » (local) ou « Supprimer pour tout le monde » (vos propres messages). Dans un statut à vous, bouton 🗑. Si la base refuse, voir la fin de SETUP-fonctionnalites.sql.
13. Retour par glissement : glissez depuis le bord gauche de l'écran pour revenir d'une étape (statut, discussion, onglet, feuille).
