// ================================================================
// utils.js - الدوال المساعدة (واتساب، خريطة، تتبع، إلخ)
// ================================================================

// ===== 1. معالجة أرقام الهواتف والواتساب =====
function getWaLink(phone) {
    if (!phone) return null;
    const matches = String(phone).match(/\d+/g);
    if (!matches) return null;
    for (let num of matches) {
        if (/^(10|11|12|15)\d{8}$/.test(num)) num = '0' + num;
        if (/^(010|011|012|015)\d{8}$/.test(num)) {
            return `https://wa.me/20${num.substring(1)}`;
        }
    }
    return null;
}

// ===== 2. رابط خرائط جوجل =====
function getMapLink(clinic) {
    const query = encodeURIComponent([
        clinic['اسم الجهة'] || '',
        clinic['المحافظة'] || '',
        clinic['العنوان'] || ''
    ].filter(Boolean).join(' '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

// ===== 3. تتبع التفاعلات في Google Analytics =====
function trackContact(method, clinic) {
    if (typeof gtag === 'function') {
        gtag('event', 'contact_facility', {
            'method': method,
            'facility_name': clinic['اسم الجهة'] || 'غير محدد',
            'specialty': clinic['التخصص'] || 'عام',
            'governorate': clinic['المحافظة'] || ''
        });
    }
}

// ===== 4. توليد معرف فريد =====
function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

// ===== 5. معالجة بيانات الإكسيل =====
function processExcelData(workbook) {
    const data = [];
    const sheets = [];
    
    workbook.SheetNames.forEach(sheetName => {
        sheets.push(sheetName);
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { range: 1 });
        
        json.forEach(row => {
            const cleanRow = {
                _id: generateId(),
                'اسم الجهة': row['اسم الجهة'] || row['اسم الجهة الطبية'] || '',
                'التخصص': row['التخصص'] || '',
                'المحافظة': row['المحافظة'] || sheetName,
                'الفرع': row['الفرع'] || row['الفروع'] || '',
                'العنوان': row['العنوان'] || '',
                'التليفون': row['التليفون'] || row['رقم التليفون'] || '',
                'الحالة': row['الحالة'] || ''
            };
            if (cleanRow['اسم الجهة']) data.push(cleanRow);
        });
    });
    
    return { data, sheets };
}

// ===== 6. دالة مساعدة للبحث الصوتي =====
function isSpeechSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

function createSpeechRecognition(onResult, onStart, onEnd, onError) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG';
    recognition.continuous = false;
    recognition.interimResults = false;
    
    if (onStart) recognition.onstart = onStart;
    if (onEnd) recognition.onend = onEnd;
    if (onError) recognition.onerror = onError;
    if (onResult) recognition.onresult = onResult;
    
    return recognition;
}