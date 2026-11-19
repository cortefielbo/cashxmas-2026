// Configuración del portal CashXMAS. Es el ÚNICO archivo que hay que editar al publicar.
// La "anon key" de Supabase es pública por diseño: la seguridad está en la base de datos.
window.CASHXMAS_CONFIG = {
  SUPABASE_URL: 'https://kpfbdcnrhxugunvtcynb.supabase.co',          // Supabase › Project Settings › API › Project URL
  SUPABASE_ANON_KEY: 'sb_publishable_BbtiSuustI4adParW-O0Kg_AIJQnKgR', // Supabase › Project Settings › API › anon public

  // Los usuarios de tienda escriben solo su usuario (ej. cortefiel-lb).
  LOGIN_DOMAIN: 'cashxmas.local',
  LOGIN_ALIASES: { marketing: 'marketingremotexbo@gmail.com' },

  // Material gráfico oficial (opcional). Deja '' para usar el diseño provisional.
  KV_IMAGE: '',                                    // ej. 'assets/img/kv.jpg'
  VOUCHER_IMAGES: { 50: '', 100: '', 150: '' },    // ej. 'assets/img/vale-100.jpg'

  PRIVACY_NOTE: 'Los datos del cliente se usan solo para controlar la entrega y el canje de vales de esta campaña.'
};
