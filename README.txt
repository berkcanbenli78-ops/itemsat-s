ITEMSATIS FIREBASE PANEL - KURULUM

DOSYALAR:
- index.html
- style.css
- app.js
- firebase-rules.json

1) FIREBASE AUTH
Firebase Console > Authentication > Sign-in method > Email/Password > Enable.

2) REALTIME DATABASE RULES
Firebase Console > Realtime Database > Rules.
firebase-rules.json dosyasinin TAMAMINI oraya yapistir ve Publish de.

3) ILK HESAP
Siteyi baskasina atmadan ONCE ilk kaydi kendin yap.
Slot 1 otomatik admin olur. Toplam sadece 5 slot vardir.

4) GITHUB
Yeni repository olustur.
index.html, style.css ve app.js dosyalarini repository ana dizinine yukle.
Settings > Pages > Deploy from a branch > main / root > Save.

5) FIREBASE AUTHORIZED DOMAIN
GitHub Pages adresin ornek olarak kullaniciadi.github.io ise:
Firebase Console > Authentication > Settings > Authorized domains > Add domain
ve kullaniciadi.github.io ekle.

NOT:
Bu paket 5 kisilik web panelini, giris/kaydi ve Firebase mesaj arayuzunu hazirlar.
ItemSatis gercek mesajlarini Firebase'e aktarmak ve outbox cevaplarini ItemSatis'a gondermek icin masaustundeki bridge/EXE'nin ayni Firebase projesine baglanmasi gerekir.

GUVENLIK:
Firebase web config'i frontend icinde bulunur. Erisim yetkisini firebase-rules.json belirler.
Service Account private key gibi sunucu anahtarlarini ASLA GitHub'a koyma.
