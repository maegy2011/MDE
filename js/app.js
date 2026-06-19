// ================================================================
// app.js - تطبيق Vue.js الرئيسي (نسخة مصححة)
// ================================================================

const { createApp, ref, computed, watch, onMounted, nextTick } = Vue;

// ================================================================
//  دوال مساعدة مدمجة
// ================================================================

function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

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

function getMapLink(clinic) {
    const query = encodeURIComponent([
        clinic['اسم الجهة'] || '',
        clinic['المحافظة'] || '',
        clinic['العنوان'] || ''
    ].filter(Boolean).join(' '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

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

function isSpeechSupported() {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
}

// ================================================================
//  إنشاء تطبيق Vue
// ================================================================

const app = createApp({
    setup() {
        // ============================================================
        //  1. المتغيرات الأساسية
        // ============================================================
        const isAdminMode = ref(false);
        const isLoading = ref(false);
        const gsheetInput = ref('');
        const searchQuery = ref('');
        const currentPage = ref(1);
        const itemsPerPage = ref(5);

        const showSettingsModal = ref(false);
        const showAnalyticsModal = ref(false);
        const showEditModal = ref(false);
        const showSheetSelectionModal = ref(false);

        const editingClinic = ref(null);

        const availableSheets = ref([]);
        const selectedSheetsToImport = ref([]);
        const tempFetchedData = ref([]);

        const appSettings = ref({
            title: '⚖️ الدليل الطبي للموظفين',
            desc: 'دليل شامل للجهات الطبية المعتمدة',
            logo: '',
            lastUpdated: '',
            gsheetUrl: '',
            savedSheets: []
        });
        const tempSettings = ref({ ...appSettings.value });

        const selectedGovs = ref([]);
        const selectedSpecs = ref([]);
        const govOpen = ref(false);
        const specOpen = ref(false);
        const govSearch = ref('');
        const specSearch = ref('');

        const clinics = ref([]);

        // ============================================================
        //  2. الواجهة الرئيسية (Google-like)
        // ============================================================
        const isHomeState = ref(true);
        const searchHistory = ref([]);

        const saveSearchState = () => {
            searchHistory.value.push({
                query: searchQuery.value,
                govs: [...selectedGovs.value],
                specs: [...selectedSpecs.value],
                page: currentPage.value
            });
        };

        const goHome = () => {
            saveSearchState();
            searchQuery.value = '';
            selectedGovs.value = [];
            selectedSpecs.value = [];
            currentPage.value = 1;
            isHomeState.value = true;
        };

        const goBack = () => {
            if (searchHistory.value.length > 0) {
                const lastState = searchHistory.value.pop();
                searchQuery.value = lastState.query;
                selectedGovs.value = [...lastState.govs];
                selectedSpecs.value = [...lastState.specs];
                currentPage.value = lastState.page;
                isHomeState.value = false;
            }
        };

        // ============================================================
        //  3. البحث الصوتي (تم الإصلاح)
        // ============================================================
        const isListening = ref(false);
        const speechSupported = ref(isSpeechSupported());
        let recognition = null;

        if (speechSupported.value) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            recognition = new SpeechRecognition();
            recognition.lang = 'ar-EG';
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onstart = () => {
                isListening.value = true;
            };

            recognition.onresult = (event) => {
                if (event.results && event.results.length > 0) {
                    const transcript = event.results[0][0].transcript;
                    searchQuery.value = transcript;
                    debounceSearch();
                }
            };

            recognition.onerror = (event) => {
                console.log('خطأ في التعرف الصوتي:', event.error);
                isListening.value = false;
                if (event.error === 'not-allowed') {
                    alert('الرجاء السماح للتطبيق باستخدام الميكروفون.');
                }
            };

            recognition.onend = () => {
                isListening.value = false;
            };
        }

        const toggleSpeechRecognition = () => {
            if (!recognition) {
                alert('المتصفح لا يدعم البحث الصوتي.');
                return;
            }
            try {
                if (isListening.value) {
                    recognition.stop();
                } else {
                    recognition.start();
                }
            } catch (error) {
                console.log('خطأ في تشغيل الميكروفون:', error);
                isListening.value = false;
            }
        };

        // ============================================================
        //  4. PWA - إشعار التثبيت
        // ============================================================
        const deferredPrompt = ref(null);
        const showInstallBtn = ref(false);

        const installPWA = async () => {
            if (!deferredPrompt.value) return;
            deferredPrompt.value.prompt();
            const { outcome } = await deferredPrompt.value.userChoice;
            if (outcome === 'accepted') showInstallBtn.value = false;
            deferredPrompt.value = null;
        };

        // ============================================================
        //  5. Computed Properties
        // ============================================================
        const hasData = computed(() => clinics.value && clinics.value.length > 0);
        const activeClinicsCount = computed(() => clinics.value.filter(c => c['الحالة'] !== 'معطل').length);

        const uniqueGovs = computed(() => {
            const govs = new Set();
            clinics.value.forEach(c => { if (c['المحافظة']) govs.add(c['المحافظة']); });
            return Array.from(govs).sort();
        });

        const uniqueSpecs = computed(() => {
            const specs = new Set();
            clinics.value.forEach(c => { if (c['التخصص']) specs.add(c['التخصص']); });
            return Array.from(specs).sort();
        });

        const filteredGovOptions = computed(() => {
            if (!govSearch.value) return uniqueGovs.value;
            return uniqueGovs.value.filter(g => g.includes(govSearch.value));
        });

        const filteredSpecOptions = computed(() => {
            if (!specSearch.value) return uniqueSpecs.value;
            return uniqueSpecs.value.filter(s => s.includes(specSearch.value));
        });

        const govHeaderText = computed(() => {
            if (selectedGovs.value.length === 0) return 'كل المحافظات';
            if (selectedGovs.value.length === 1) return selectedGovs.value[0];
            return `${selectedGovs.value.length} محافظات`;
        });

        const specHeaderText = computed(() => {
            if (selectedSpecs.value.length === 0) return 'كل التخصصات';
            if (selectedSpecs.value.length === 1) return selectedSpecs.value[0];
            return `${selectedSpecs.value.length} تخصصات`;
        });

        let searchTimeout = null;

        const filteredClinics = computed(() => {
            let result = [...clinics.value];
            if (!isAdminMode.value) {
                result = result.filter(c => c['الحالة'] !== 'معطل');
            }
            if (selectedGovs.value.length > 0) {
                result = result.filter(c => selectedGovs.value.includes(c['المحافظة']));
            }
            if (selectedSpecs.value.length > 0) {
                result = result.filter(c => selectedSpecs.value.includes(c['التخصص']));
            }
            if (searchQuery.value.trim()) {
                const q = searchQuery.value.trim().toLowerCase();
                result = result.filter(c => {
                    const text = [
                        c['اسم الجهة'], c['التخصص'], c['المحافظة'],
                        c['الفرع'], c['العنوان'], c['التليفون']
                    ].join(' ').toLowerCase();
                    return text.includes(q);
                });
            }
            return result;
        });

        const totalPages = computed(() => Math.ceil(filteredClinics.value.length / itemsPerPage.value) || 1);
        const paginatedClinics = computed(() => {
            const start = (currentPage.value - 1) * itemsPerPage.value;
            return filteredClinics.value.slice(start, start + itemsPerPage.value);
        });

        const visiblePages = computed(() => {
            const pages = [];
            let start = Math.max(1, currentPage.value - 2);
            let end = Math.min(totalPages.value, start + 4);
            if (end - start < 4) start = Math.max(1, end - 4);
            for (let i = start; i <= end; i++) pages.push(i);
            return pages;
        });

        watch([searchQuery, selectedGovs, selectedSpecs, itemsPerPage], () => { currentPage.value = 1; });

        // ============================================================
        //  6. دوال الفلاتر والبحث
        // ============================================================
        const debounceSearch = () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(applyFilters, 300);
        };

        const applyFilters = () => {
            const hasFilters = searchQuery.value.trim() !== '' ||
                selectedGovs.value.length > 0 ||
                selectedSpecs.value.length > 0;
            if (hasFilters) {
                if (isHomeState.value) saveSearchState();
                isHomeState.value = false;
            } else {
                isHomeState.value = true;
            }
        };

        // ============================================================
        //  7. دوال الإعدادات
        // ============================================================
        const openSettingsModal = () => {
            tempSettings.value = { ...appSettings.value };
            showSettingsModal.value = true;
        };

        const saveSettings = () => {
            appSettings.value = { ...tempSettings.value };
            localStorage.setItem('medicalAppSettings', JSON.stringify(appSettings.value));
            showSettingsModal.value = false;
            if (appSettings.value.gsheetUrl) silentSync();
        };

        // ============================================================
        //  8. رفع اللوجو
        // ============================================================
        const handleLogoUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                tempSettings.value.logo = e.target.result;
            };
            reader.readAsDataURL(file);
        };

        // ============================================================
        //  9. اختيار الشيتات
        // ============================================================
        const toggleAllSheets = (e) => {
            if (e.target.checked) {
                selectedSheetsToImport.value = [...availableSheets.value];
            } else {
                selectedSheetsToImport.value = [];
            }
        };

        const promptSheetSelection = () => {
            if (appSettings.value.savedSheets && appSettings.value.savedSheets.length > 0) {
                selectedSheetsToImport.value = appSettings.value.savedSheets.filter(s => availableSheets.value.includes(s));
            } else {
                selectedSheetsToImport.value = [...availableSheets.value];
            }
            showSheetSelectionModal.value = true;
            isLoading.value = false;
        };

        const confirmSheetSelection = () => {
            if (selectedSheetsToImport.value.length === 0) return alert('الرجاء اختيار شيت واحد على الأقل!');
            clinics.value = tempFetchedData.value.filter(row => selectedSheetsToImport.value.includes(row['المحافظة']));
            localStorage.setItem('medicalDirectoryData', JSON.stringify(clinics.value));
            appSettings.value.savedSheets = [...selectedSheetsToImport.value];
            const now = new Date();
            appSettings.value.lastUpdated = "آخر تحديث: " + now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG');
            localStorage.setItem('medicalAppSettings', JSON.stringify(appSettings.value));
            showSheetSelectionModal.value = false;
            alert('تم جلب البيانات بنجاح! 🚀');
        };

        // ============================================================
        //  10. جلب البيانات
        // ============================================================
        const handleFileUpload = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            isLoading.value = true;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const processed = processExcelData(workbook);
                    tempFetchedData.value = processed.data;
                    availableSheets.value = processed.sheets;
                    promptSheetSelection();
                } catch (error) {
                    alert('حدث خطأ أثناء قراءة الملف.');
                    isLoading.value = false;
                }
            };
            reader.readAsArrayBuffer(file);
        };

        const fetchFromGoogleSheet = async () => {
            const url = gsheetInput.value.trim();
            if (!url) return alert('الرجاء إدخال رابط الـ API (Web App URL)!');
            if (!url.includes('script.google.com')) return alert('رابط غير صحيح! يرجى إدخال رابط تطبيق الويب (Apps Script).');
            isLoading.value = true;
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('فشل الاتصال');
                const jsonData = await response.json();
                if (jsonData && jsonData.length > 0) {
                    tempFetchedData.value = jsonData;
                    const sheetsSet = new Set();
                    jsonData.forEach(row => { if (row['المحافظة']) sheetsSet.add(row['المحافظة']); });
                    availableSheets.value = Array.from(sheetsSet);
                    if (!appSettings.value.gsheetUrl) appSettings.value.gsheetUrl = url;
                    promptSheetSelection();
                } else {
                    alert('لم يتم العثور على بيانات في الشيت.');
                    isLoading.value = false;
                }
            } catch (error) {
                console.error(error);
                alert('حدث خطأ أثناء جلب البيانات. تأكد من الرابط.');
                isLoading.value = false;
            }
        };

        const silentSync = async () => {
            const url = appSettings.value.gsheetUrl;
            if (!url || !url.includes('script.google.com')) return;
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error('فشل التحديث');
                const jsonData = await response.json();
                if (jsonData && jsonData.length > 0) {
                    let newData = jsonData;
                    if (appSettings.value.savedSheets && appSettings.value.savedSheets.length > 0) {
                        newData = jsonData.filter(row => appSettings.value.savedSheets.includes(row['المحافظة']));
                    }
                    clinics.value = newData;
                    localStorage.setItem('medicalDirectoryData', JSON.stringify(clinics.value));
                    const now = new Date();
                    appSettings.value.lastUpdated = "آخر تحديث: " + now.toLocaleDateString('ar-EG') + ' ' + now.toLocaleTimeString('ar-EG');
                    localStorage.setItem('medicalAppSettings', JSON.stringify(appSettings.value));
                }
            } catch (error) {
                console.error('خطأ في المزامنة:', error);
            }
        };

        // ============================================================
        //  11. عمليات CRUD
        // ============================================================
        const openEditModal = (clinic) => {
            editingClinic.value = { ...clinic };
            showEditModal.value = true;
        };

        const saveEdit = () => {
            if (!editingClinic.value) return;
            const index = clinics.value.findIndex(c => c._id === editingClinic.value._id);
            if (index !== -1) {
                clinics.value[index] = { ...editingClinic.value };
                localStorage.setItem('medicalDirectoryData', JSON.stringify(clinics.value));
            }
            showEditModal.value = false;
            editingClinic.value = null;
        };

        const toggleClinicStatus = (clinic) => {
            clinic['الحالة'] = clinic['الحالة'] === 'معطل' ? '' : 'معطل';
            localStorage.setItem('medicalDirectoryData', JSON.stringify(clinics.value));
        };

        const deleteClinic = (id) => {
            if (confirm('هل أنت متأكد من حذف هذا الفرع نهائياً؟')) {
                clinics.value = clinics.value.filter(c => c._id !== id);
                localStorage.setItem('medicalDirectoryData', JSON.stringify(clinics.value));
            }
        };

        // ============================================================
        //  12. الإحصائيات (Chart.js)
        // ============================================================
        let govChartInstance = null;
        let specChartInstance = null;

        const generateAnalytics = () => {
            nextTick(() => {
                const govCtx = document.getElementById('govChart');
                const specCtx = document.getElementById('specChart');
                if (!govCtx || !specCtx) return;
                if (govChartInstance) { govChartInstance.destroy(); govChartInstance = null; }
                if (specChartInstance) { specChartInstance.destroy(); specChartInstance = null; }

                const activeData = clinics.value.filter(c => c['الحالة'] !== 'معطل');
                const govCounts = {};
                const specCounts = {};
                activeData.forEach(c => {
                    if (c['المحافظة']) govCounts[c['المحافظة']] = (govCounts[c['المحافظة']] || 0) + 1;
                    if (c['التخصص']) specCounts[c['التخصص']] = (specCounts[c['التخصص']] || 0) + 1;
                });

                const textColor = '#475569';
                const gridColor = '#E2E8F0';

                govChartInstance = new Chart(govCtx, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(govCounts),
                        datasets: [{ label: 'عدد الجهات', data: Object.values(govCounts), backgroundColor: '#C5A880', borderRadius: 4 }]
                    },
                    options: {
                        responsive: true,
                        plugins: { legend: { display: false }, title: { display: true, text: 'توزيع الجهات حسب المحافظة', color: textColor, font: { family: 'Cairo', size: 14 } } },
                        scales: { y: { ticks: { color: textColor }, grid: { color: gridColor } }, x: { ticks: { color: textColor }, grid: { display: false } } }
                    }
                });

                const sortedSpecs = Object.entries(specCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
                const colors = ['#C5A880', '#0284C7', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6', '#F97316', '#6366F1'];
                specChartInstance = new Chart(specCtx, {
                    type: 'doughnut',
                    data: {
                        labels: sortedSpecs.map(s => s[0]),
                        datasets: [{ data: sortedSpecs.map(s => s[1]), backgroundColor: colors.slice(0, sortedSpecs.length) }]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            legend: { position: 'right', labels: { color: textColor, font: { family: 'Cairo' } } },
                            title: { display: true, text: 'أكثر 10 تخصصات', color: textColor, font: { family: 'Cairo', size: 14 } } }
                    }
                });
            });
        };

        // ============================================================
        //  13. تصدير PDF
        // ============================================================
        const exportToPDF = () => {
            if (filteredClinics.value.length === 0) return alert('لا توجد بيانات لتصديرها.');
            const container = document.getElementById('pdf-export-container');
            container.style.display = 'block';
            container.innerHTML = '';
            const dateStr = appSettings.value.lastUpdated || new Date().toLocaleDateString('ar-EG');
            const logoHtml = appSettings.value.logo ? `<img src="${appSettings.value.logo}" style="max-height:120px;margin-bottom:30px;border-radius:8px;box-shadow:0 4px 15px rgba(0,0,0,0.5);">` : '';

            let html = `<div style="font-family:'Cairo',sans-serif;direction:rtl;background-color:#FDFBF7;color:#0F172A;width:100%;">
                <div style="height:188mm;display:flex;flex-direction:column;justify-content:center;align-items:center;background:linear-gradient(135deg,#0F172A 0%,#1E293B 100%);border:10px solid #C5A880;padding:40px;box-sizing:border-box;text-align:center;position:relative;">
                    ${logoHtml}
                    <h1 style="font-size:55px;font-weight:900;margin:0 0 20px 0;color:#FFFFFF;text-shadow:2px 2px 4px rgba(0,0,0,0.5);">${appSettings.value.title}</h1>
                    <h2 style="font-size:28px;font-weight:700;margin:0 0 30px 0;color:#C5A880;">وثيقة داخلية - وزارة العدل</h2>
                    <div style="width:150px;height:5px;background-color:#C5A880;margin:0 auto 30px auto;border-radius:3px;"></div>
                    <p style="font-size:20px;color:#94A3B8;max-width:80%;line-height:1.6;">${appSettings.value.desc}</p>
                    <div style="position:absolute;bottom:30px;left:0;right:0;text-align:center;"><p style="font-size:16px;color:#64748B;font-weight:bold;">تاريخ الإصدار: ${dateStr}</p></div>
                </div>
                <div class="html2pdf__page-break"></div>
                <div><table style="width:100%;border-collapse:collapse;font-size:13px;text-align:right;">
                    <thead style="display:table-header-group;">
                        <tr><td colspan="6" style="padding:0 0 15px 0;border-bottom:4px solid #C5A880;margin-bottom:20px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div><h3 style="margin:0;font-size:22px;font-weight:900;color:#0F172A;">${appSettings.value.title}</h3><span style="color:#C5A880;font-size:13px;font-weight:bold;">وثيقة داخلية</span></div>
                                ${appSettings.value.logo ? `<img src="${appSettings.value.logo}" style="height:45px;border-radius:4px;">` : ''}
                            </div>
                        </td></tr>
                        <tr style="background-color:#0F172A;color:#C5A880;">
                            <th style="padding:14px 10px;border:1px solid #C5A880;width:5%;">م</th>
                            <th style="padding:14px 10px;border:1px solid #C5A880;width:25%;">اسم الجهة</th>
                            <th style="padding:14px 10px;border:1px solid #C5A880;width:15%;">التخصص</th>
                            <th style="padding:14px 10px;border:1px solid #C5A880;width:15%;">المحافظة</th>
                            <th style="padding:14px 10px;border:1px solid #C5A880;width:25%;">العنوان</th>
                            <th style="padding:14px 10px;border:1px solid #C5A880;width:15%;">التليفون</th>
                        </tr>
                    </thead>
                    <tfoot style="display:table-footer-group;">
                        <tr><td colspan="6" style="padding:15px 0 0 0;border-top:3px solid #C5A880;text-align:center;color:#64748B;font-size:12px;font-weight:bold;">تم إنشاء هذا الدليل آلياً | ${dateStr}</td></tr>
                    </tfoot>
                    <tbody>`;

            filteredClinics.value.forEach((clinic, index) => {
                const bg = index % 2 === 0 ? '#FFFFFF' : '#FDFBF7';
                html += `<tr style="background-color:${bg};page-break-inside:avoid;">
                    <td style="padding:12px 10px;border:1px solid #E2E8F0;text-align:center;font-weight:900;color:#0F172A;">${index + 1}</td>
                    <td style="padding:12px 10px;border:1px solid #E2E8F0;font-weight:bold;color:#0F172A;">${clinic['اسم الجهة'] || ''}</td>
                    <td style="padding:12px 10px;border:1px solid #E2E8F0;color:#334155;font-weight:600;">${clinic['التخصص'] || ''}</td>
                    <td style="padding:12px 10px;border:1px solid #E2E8F0;color:#334155;font-weight:600;">${clinic['المحافظة'] || ''}</td>
                    <td style="padding:12px 10px;border:1px solid #E2E8F0;color:#334155;">${clinic['العنوان'] || ''}</td>
                    <td style="padding:12px 10px;border:1px solid #E2E8F0;direction:ltr;text-align:right;color:#0F172A;font-weight:bold;">${clinic['التليفون'] || ''}</td>
                </tr>`;
            });

            html += `</tbody></table></div></div>`;
            container.innerHTML = html;

            const opt = {
                margin: 10,
                filename: 'الدليل_الطبي_الداخلي.pdf',
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
                pagebreak: { mode: ['css', 'legacy'] }
            };
            html2pdf().set(opt).from(container).save().then(() => {
                container.style.display = 'none';
                container.innerHTML = '';
            });
        };

        // ============================================================
        //  14. تصدير Excel
        // ============================================================
        const exportToExcel = () => {
            if (filteredClinics.value.length === 0) return alert('لا توجد بيانات لتصديرها.');
            const excelData = filteredClinics.value.map((c, i) => ({
                'م': i + 1,
                'اسم الجهة': c['اسم الجهة'] || '',
                'التخصص': c['التخصص'] || '',
                'المحافظة': c['المحافظة'] || '',
                'الفرع': c['الفرع'] || '',
                'العنوان': c['العنوان'] || '',
                'التليفون': c['التليفون'] || '',
                'الحالة': c['الحالة'] || 'مفعل'
            }));
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(excelData), 'الدليل الطبي');
            XLSX.writeFile(wb, 'الدليل_الطبي_المفلتر.xlsx');
        };

        // ============================================================
        //  15. إعداد Pusher
        // ============================================================
        const setupPusher = () => {
            try {
                const key = APP_CONFIG.PUSHER_KEY;
                const cluster = APP_CONFIG.PUSHER_CLUSTER;
                if (key && key !== '{{PUSHER_KEY}}') {
                    const pusher = new Pusher(key, { cluster });
                    pusher.subscribe(APP_CONFIG.PUSHER_CHANNEL).bind(APP_CONFIG.PUSHER_EVENT, () => silentSync());
                    console.log('✅ Pusher متصل وجاهز للتحديثات اللحظية');
                }
            } catch (e) {
                console.log('⚠️ Pusher not configured');
            }
        };

        // ============================================================
        //  16. دورة الحياة
        // ============================================================
        onMounted(() => {
            const savedSettings = localStorage.getItem('medicalAppSettings');
            if (savedSettings) {
                try { appSettings.value = { ...appSettings.value, ...JSON.parse(savedSettings) }; } catch (e) {}
            }
            const savedData = localStorage.getItem('medicalDirectoryData');
            if (savedData) {
                try {
                    clinics.value = JSON.parse(savedData);
                    setupPusher();
                } catch (e) {}
            }

            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredPrompt.value = e;
                showInstallBtn.value = true;
            });

            window.addEventListener('appinstalled', () => {
                showInstallBtn.value = false;
                deferredPrompt.value = null;
            });
        });

        // ============================================================
        //  17. الإرجاع
        // ============================================================
        return {
            isAdminMode, isLoading, gsheetInput, searchQuery,
            showSettingsModal, showAnalyticsModal, showEditModal, showSheetSelectionModal,
            editingClinic, availableSheets, selectedSheetsToImport,
            appSettings, tempSettings,
            selectedGovs, selectedSpecs, govOpen, specOpen, govSearch, specSearch,
            clinics, currentPage, itemsPerPage,

            showInstallBtn, installPWA,

            isHomeState, searchHistory, goHome, goBack,

            isListening, speechSupported, toggleSpeechRecognition,

            hasData, activeClinicsCount, uniqueGovs, uniqueSpecs,
            filteredGovOptions, filteredSpecOptions,
            govHeaderText, specHeaderText,
            filteredClinics, totalPages, paginatedClinics, visiblePages,

            getWaLink, getMapLink, trackContact,

            debounceSearch, applyFilters,
            openSettingsModal, saveSettings, handleLogoUpload,
            toggleAllSheets, confirmSheetSelection,
            handleFileUpload, fetchFromGoogleSheet, silentSync,
            openEditModal, saveEdit, toggleClinicStatus, deleteClinic,
            generateAnalytics, exportToPDF, exportToExcel
        };
    }
});

app.mount('#app');