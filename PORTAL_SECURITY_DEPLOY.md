# Portal seguro de clientes

Esta rama mueve la validación del Portal del Cliente al backend.

## Qué cambia

- El navegador ya no consulta todos los documentos de `clients` para decidir cuáles mostrar.
- `portalAccess` valida `portalId + teléfono + código` dentro de Cloud Functions.
- Tras 5 intentos fallidos desde la misma IP/portal se aplica un bloqueo temporal de 15 minutos.
- Los códigos existentes se conservan para no romper accesos enviados.
- Los clientes nuevos reciben un código alfanumérico criptográficamente aleatorio de 4 caracteres mediante el trigger `securePortalCodeOnCreate`.
- Los enlaces antiguos con `?client=` ya no revelan credenciales directamente: el usuario debe validar teléfono + código.

## Despliegue requerido antes de fusionar a main

1. Instalar Firebase CLI si no está instalado:

   npm install -g firebase-tools

2. Iniciar sesión:

   firebase login

3. Desde la raíz del repositorio:

   cd functions
   npm install
   cd ..
   firebase deploy --only functions

4. Verificar que exista:

   https://us-central1-dashboard-streaming-akaza.cloudfunctions.net/portalAccess

5. Probar el Portal desde esta rama y recién después fusionar a `main`.

> Cloud Functions puede requerir que el proyecto Firebase use el plan Blaze. El código no contiene claves privadas ni service accounts; Firebase Admin obtiene sus credenciales automáticamente al desplegarse dentro del proyecto.
