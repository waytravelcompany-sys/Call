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
12. Suppression : appui long sur un message ou un vocal → « Supprimer pour moi » (local) ou « Supprimer pour tout le monde » (vos propres messages). Dans un statut à vous, bouton 🗑. Si la base refuse (règle RLS), exécutez SUPPRESSION.sql dans Supabase.
13. Retour par glissement : glissez depuis le bord gauche de l'écran pour revenir d'une étape (statut, discussion, onglet, feuille).
14. Installation PWA : hébergez TOUS ces fichiers dans le même dossier HTTPS (GitHub Pages) : index.html, config.js, manifest.webmanifest, sw.js, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png. iPhone : Safari > Partager > « Sur l'écran d'accueil ». Android/Chrome : menu > « Installer l'application ». Le fichier « style » n'est pas utilisé (le CSS est dans index.html) : vous pouvez le supprimer.
15. Notifications push (une seule fois) :
   a) Générez les clés : npx web-push generate-vapid-keys
   b) Collez la clé PUBLIQUE dans config.js (vapidPublicKey). Ne mettez JAMAIS la clé privée dans les fichiers du site.
   c) Supabase > SQL Editor : exécutez SETUP-push-groupes.sql.
   d) Déployez la fonction : supabase functions deploy send-push --no-verify-jwt
   e) Secrets : supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:vous@exemple.com WEBHOOK_SECRET=un-mot-secret-long
   f) Supabase > Database > Webhooks > Create : table messages, évènement INSERT, type « Supabase Edge Functions » (send-push), ajoutez l'en-tête x-webhook-secret = le même mot secret.
   g) Dans l'app (installée sur l'écran d'accueil sur iPhone, iOS 16.4 minimum) : Vous > Notifications, puis acceptez l'autorisation.
16. Groupes : dans un groupe, touchez son nom en haut pour voir les participants, en ajouter, renommer le groupe ou le quitter (SETUP-push-groupes.sql requis).
17. Chiffrement de bout en bout : non implémenté. La connexion est chiffrée (HTTPS) mais Supabase peut lire les messages stockés ; l'app l'indique dans Vous > Chiffrement.
18. VERSION 3 — à faire dans cet ordre :
   a) Supabase > SQL Editor : exécutez SETUP-v3.sql (recherche privée par numéro/nom d'utilisateur exact, profils visibles seulement pour contacts et discussions communes, statuts avec audience et couleur, liens du profil). Exécutez aussi, si pas déjà fait : SETUP-push-groupes.sql, SUPPRESSION.sql, SETUP-fonctionnalites.sql.
   b) Remplacez sur GitHub : index.html, app.js, sw.js (nouvelle version : cache hors-ligne de l'app).
   c) Sur le téléphone : supprimez l'app de l'écran d'accueil, rouvrez le lien, réinstallez.
19. Nouveautés : Actus (statut texte, photo/vidéo, caméra, composition de 2 à 4 photos, recadrer, texte, dessin, autocollants, légende, audience) ; page Profil (Vous > Modifier) ; page d'informations du contact et du groupe ; appui long sur une discussion (non lu, archiver, silencieux, verrouiller, favoris, listes, bloquer, effacer, supprimer) ; sons de notification (app ouverte) pour messages privés et groupes ; écran sans zoom ; connexion conservée ; mode hors-ligne (lecture du cache, messages écrits hors ligne envoyés au retour du réseau) ; lien d'invitation et installation.
20. Recherche de contact : on ne voit plus la liste de tous les comptes. Il faut le numéro complet ou le nom d'utilisateur exact.
21. Envoyer l'app par Xender (Android) : créez un APK à partir de votre lien avec https://www.pwabuilder.com (Package for stores > Android), puis envoyez le fichier APK par Xender. Le destinataire doit autoriser l'installation d'applications inconnues.
22. Limites connues : la musique des statuts n'existe pas (droits d'auteur) ; les sons personnalisés ne jouent que lorsque l'app est ouverte (les notifications push utilisent le son du système) ; « Mode silencieux » ne coupe que les sons dans l'app.

