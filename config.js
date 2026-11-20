// Configuración del portal CashXMAS. Es el ÚNICO archivo que hay que editar al publicar.
// La "anon key" de Supabase es pública por diseño: la seguridad está en la base de datos.
window.CASHXMAS_CONFIG = {
  SUPABASE_URL: 'https://kpfbdcnrhxugunvtcynb.supabase.co',          // Supabase › Project Settings › API › Project URL
  SUPABASE_ANON_KEY: 'sb_publishable_BbtiSuustI4adParW-O0Kg_AIJQnKgR', // Supabase › Project Settings › API › anon public

  // Los usuarios de tienda escriben solo su usuario (ej. cortefiel-lb).
  LOGIN_DOMAIN: 'cashxmas.local',
  LOGIN_ALIASES: { marketing: 'marketingremotexbo@gmail.com' },

  // Imágenes de los vales (vienen incluidas: assets/img/vale-50.jpg, vale-100.jpg, vale-150.jpg).
  // Solo cambia esto si se reemplaza el diseño impreso.
  VOUCHER_IMAGES: { 50: '', 100: '', 150: '' },

  PRIVACY_NOTE: 'Los datos del cliente se usan solo para controlar la entrega y el canje de vales de esta campaña.'
};
