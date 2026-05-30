// Importamos los scripts de Firebase para segundo plano
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Inicializamos Firebase con los mismos datos de tu app
firebase.initializeApp({
    apiKey: "AIzaSyAUKSeBHdB9An-01RdHx_vYg8yq3UY-bzw",
    authDomain: "dashboard-streaming-akaza.firebaseapp.com",
    projectId: "dashboard-streaming-akaza",
    storageBucket: "dashboard-streaming-akaza.firebasestorage.app",
    messagingSenderId: "143744610768",
    appId: "1:143744610768:web:f522c5dda22d24f1bcc9d5"
});

// Activamos el receptor de mensajes
const messaging = firebase.messaging();

// Configuración para atrapar la notificación y mostrarla
messaging.onBackgroundMessage(function(payload) {
  console.log('Mensaje recibido en segundo plano: ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    // Aquí puedes poner el link a la cara de Akaza para que salga en el celular
    icon: 'https://firebasestorage.googleapis.com/v0/b/dashboard-streaming-akaza.appspot.com/o/news%2Ftu-logo-aqui.png?alt=media' 
  };

  //self.registration.showNotification(notificationTitle, notificationOptions);
});
