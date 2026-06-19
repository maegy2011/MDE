// ================================================================
// config.js - إعدادات التطبيق (مفاتيح API، ثوابت، إلخ)
// ================================================================

const APP_CONFIG = {
    // ===== Pusher (للتحديث اللحظي) =====
    // سيتم استبدالها تلقائياً عبر GitHub Actions
    PUSHER_KEY: '{{PUSHER_KEY}}',
    PUSHER_CLUSTER: '{{PUSHER_CLUSTER}}',
    PUSHER_CHANNEL: 'medical-directory',
    PUSHER_EVENT: 'data-updated',

    // ===== Google Analytics =====
    GA_MEASUREMENT_ID: '{{GA_MEASUREMENT_ID}}',

    // ===== الإعدادات الافتراضية للتطبيق =====
    DEFAULT_TITLE: '⚖️ الدليل الطبي للموظفين',
    DEFAULT_DESC: 'دليل شامل للجهات الطبية المعتمدة',
    DEFAULT_PASSCODE: '2026',

    // ===== إعدادات الترقيم =====
    DEFAULT_ITEMS_PER_PAGE: 5,
    PAGINATION_OPTIONS: [5, 10, 20, 50, 100],

    // ===== ألوان الرسوم البيانية =====
    CHART_COLORS: ['#C5A880', '#0284C7', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1']
};

// ===== تصدير الإعدادات =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = APP_CONFIG;
}