import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { createApp, ref, computed, onMounted, watch, nextTick, getCurrentInstance } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

const firebaseConfig = {
  apiKey: "AIzaSyAB21TMFMPr1UCujtMFH2X6OvBYMQb_ff8",
  authDomain: "fukuoka-a41df.firebaseapp.com",
  projectId: "fukuoka-a41df",
  storageBucket: "fukuoka-a41df.firebasestorage.app",
  messagingSenderId: "569991059297",
  appId: "1:569991059297:web:96cb6a2831f60f5197d720",
  measurementId: "G-KSMQY3QYF8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

function getOrCreateTripId() {
    const urlParams = new URLSearchParams(window.location.search);
    let tripId = urlParams.get('trip');
    
    if (!tripId) {
        const historyStr = localStorage.getItem('tabi_trip_history');
        if (historyStr) {
            try {
                const history = JSON.parse(historyStr);
                if (history && history.length > 0) {
                    history.sort((a, b) => b.lastAccessed - a.lastAccessed);
                    tripId = history[0].id;
                    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?trip=' + tripId;
                    window.history.replaceState({ path: newUrl }, '', newUrl);
                    return tripId;
                }
            } catch (e) {}
        }

        tripId = 'trip_' + Math.random().toString(36).substring(2, 10);
        const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?trip=' + tripId;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    }
    return tripId;
}

const TRIP_DOC_ID = getOrCreateTripId(); 
const tripDocRef = doc(db, "trips", TRIP_DOC_ID);

const CURRENCY_MAP = {
    'japan': { s: '¥', r: 0.21, n: '日幣' }, 'kyoto': { s: '¥', r: 0.21, n: '日幣' }, 'osaka': { s: '¥', r: 0.21, n: '日幣' }, 'tokyo': { s: '¥', r: 0.21, n: '日幣' },
    'usa': { s: '$', r: 32.5, n: '美金' }, 'europe': { s: '€', r: 35.0, n: '歐元' }, 'uk': { s: '£', r: 41.5, n: '英鎊' }, 'korea': { s: '₩', r: 0.024, n: '韓元' },
    'taiwan': { s: 'NT$', r: 1, n: '台幣' }, 'thailand': { s: '฿', r: 0.9, n: '泰銖' }, 'china': { s: '¥', r: 4.5, n: '人民幣' },
    '日本': { s: '¥', r: 0.21, n: '日幣' }, '京都': { s: '¥', r: 0.21, n: '日幣' }, '大阪': { s: '¥', r: 0.21, n: '日幣' }, '東京': { s: '¥', r: 0.21, n: '日幣' },
    '美國': { s: '$', r: 32.5, n: '美金' }, '歐洲': { s: '€', r: 35.0, n: '歐元' }, '法國': { s: '€', r: 35.0, n: '歐元' }, '英國': { s: '£', r: 41.5, n: '英鎊' },
    '韓國': { s: '₩', r: 0.024, n: '韓元' }, '台灣': { s: 'NT$', r: 1, n: '台幣' }, '泰國': { s: '฿', r: 0.9, n: '泰銖' }, '中國': { s: '¥', r: 4.5, n: '人民幣' }
};

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

createApp({
    setup() {
        const currentTab = ref('schedule');
        const currentDayIndex = ref(0);
        const days = ref([{ items: [] }]);
        const travelers = ref(['我', '旅伴']);
        const expenses = ref([]);
        const notes = ref([]); 
        const shoppingList = ref([]);
        const newShopName = ref('');
        const showShoppingEditModal = ref(false);
        const editForm = ref({ shopId: null, itemId: null, text: '', link: '', note: '', images: [] });
        const viewingImage = ref(null);
        const exchangeRate = ref(0.21);
        const startDate = ref('');
        const destination = ref('');
        const currencySymbol = ref('¥');
        const showWizard = ref(false);
        const showItemModal = ref(false), showExpenseModal = ref(false), showSettingsModal = ref(false), showNoteModal = ref(false), showTravelerModal = ref(false), showHistoryModal = ref(false);
        const isEditing = ref(false), isNoteEditing = ref(false), isExpenseEditing = ref(false);
        const expenseFilter = ref('all');
        const toast = ref({ show: false, message: '', type: 'success' });
        const confirmModal = ref({ show: false, title: '', message: '', callback: null });
        const expandedItemId = ref(null);
        const expandedNoteId = ref(null); 
        const expandedDates = ref([]); 
        const editingTravelers = ref([]);
        const tripHistory = ref([]);
        const isSyncing = ref(false);
        const isRemoteUpdate = ref(false); 
        const permissionError = ref(false);
        let unsubscribeSnapshot = null;
        const tempDestination = ref(''), tempStartDate = ref(''), detectedInfo = ref('');
        const tempHour = ref('09'), tempMinute = ref('00'), tempHourExp = ref('09'), tempMinuteExp = ref('00');
        const formItem = ref({ id: null, time: '', title: '', location: '', note: '', dayIndex: 0, originalDayIndex: 0 });
        const formExpense = ref({ id: null, title: '', amount: '', payer: travelers.value[0], beneficiaries: [], type: 'shared', date: '', time: '', note: '' });
        const formNote = ref({ id: null, title: '', content: '', updatedAt: '', images: [] });
        
        const rulesText = `rules_version = '2';\nservice cloud.firestore {\nmatch /databases/{database}/documents {\nmatch /{document=**} {\n  allow read, write: if request.auth != null;\n}\n}\n}`;

        const instance = getCurrentInstance();

        const formatUrl = (url) => {
            if (!url) return '#';
            let cleanUrl = url.trim();
            if (/^https?:\/\//i.test(cleanUrl)) return cleanUrl;
            return 'https://' + cleanUrl;
        };

        const loadHistory = () => {
            const history = localStorage.getItem('tabi_trip_history');
            if (history) tripHistory.value = JSON.parse(history);
        };

        const saveToHistory = (id, dest, date) => {
            if (!dest) return;
            let history = localStorage.getItem('tabi_trip_history');
            history = history ? JSON.parse(history) : [];
            const existingIdx = history.findIndex(t => t.id === id);
            const tripData = { id, dest, date, lastAccessed: Date.now() };
            if (existingIdx > -1) {
                history[existingIdx] = tripData;
            } else {
                history.unshift(tripData);
            }
            history.sort((a, b) => b.lastAccessed - a.lastAccessed);
            localStorage.setItem('tabi_trip_history', JSON.stringify(history));
            tripHistory.value = history;
        };

        const switchTrip = (id) => {
            window.location.href = window.location.pathname + '?trip=' + id;
        };

        const deleteFromHistory = (id) => {
            triggerConfirm('刪除紀錄', '確定要從清單中移除此旅程嗎？(雲端資料不會被刪除)', () => {
                let history = tripHistory.value.filter(t => t.id !== id);
                localStorage.setItem('tabi_trip_history', JSON.stringify(history));
                tripHistory.value = history;
            });
        };

        const copyShareLink = () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                showToast('已複製專屬連結！快貼給旅伴吧');
            });
        };

        const compressImage = (file) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_DIM = 800; 
                        let width = img.width;
                        let height = img.height;
                        if (width > height) {
                            if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; }
                        } else {
                            if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        let quality = 0.7; 
                        let dataUrl = canvas.toDataURL('image/jpeg', quality);
                        const MAX_CHAR_LENGTH = 150000; 
                        while (dataUrl.length > MAX_CHAR_LENGTH && quality > 0.2) {
                            quality -= 0.1;
                            dataUrl = canvas.toDataURL('image/jpeg', quality);
                        }
                        resolve(dataUrl); 
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        };

        const currentDayItems = computed(() => days.value[currentDayIndex.value]?.items || []);
        const totalExpense = computed(() => expenses.value.reduce((sum, exp) => sum + Number(exp.amount), 0));
        const filteredExpenses = computed(() => {
            let list = expenseFilter.value === 'all' ? [...expenses.value] : expenses.value.filter(e => e.type === expenseFilter.value);
            return list.sort((a, b) => b.id - a.id);
        });
        const sortedNotes = computed(() => [...notes.value].sort((a, b) => b.id - a.id));
        const statistics = computed(() => {
            let stats = { shared: 0, individual: {} }; travelers.value.forEach(t => stats.individual[t] = 0);
            expenses.value.forEach(exp => {
                const amt = Number(exp.amount);
                if (exp.type === 'shared') stats.shared += amt;
                else if (exp.beneficiaries?.length) {
                    const split = amt / exp.beneficiaries.length;
                    exp.beneficiaries.forEach(b => { if (stats.individual[b] !== undefined) stats.individual[b] += split; });
                }
            });
            return stats;
        });

        const toggleExpand = (id) => expandedItemId.value = expandedItemId.value === id ? null : id;
        const toggleExpandNote = (id) => expandedNoteId.value = expandedNoteId.value === id ? null : id; 
        const toggleDateGroup = (date) => {
             const idx = collapsedDates.value.indexOf(date);
             if (idx > -1) collapsedDates.value.splice(idx, 1);
             else collapsedDates.value.push(date);
        };
        const showMemberStats = ref(true); 
        const collapsedDates = ref([]);
        const dragState = ref({ isDown: false, startX: 0, scrollLeft: 0 });
        const dragIndex = ref(null);
        const dateContainer = ref(null);
        const dragActive = ref(false); 
        let longPressTimer = null;

        const onTouchDragStart = (e, index) => { 
            longPressTimer = setTimeout(() => {
                dragIndex.value = index;
                dragActive.value = true;
                if (navigator.vibrate) navigator.vibrate(50);
            }, 300); 
        };
        const onTouchDragMove = (e) => {
            if (!dragActive.value) { clearTimeout(longPressTimer); return; }
            if(e.cancelable) e.preventDefault(); 
            if (dragIndex.value === null) return;
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.group');
            if (!target) return;
            const children = Array.from(target.parentNode.children);
            const itemElements = children.filter(c => c.classList.contains('group'));
            const newIndex = itemElements.indexOf(target);
            if (newIndex !== -1 && newIndex !== dragIndex.value) {
                const items = days.value[currentDayIndex.value].items;
                const [movedItem] = items.splice(dragIndex.value, 1);
                items.splice(newIndex, 0, movedItem);
                dragIndex.value = newIndex;
            }
        };
        const onTouchDragEnd = () => { clearTimeout(longPressTimer); dragIndex.value = null; dragActive.value = false; };
        const onMouseDragStart = (e, index) => { dragIndex.value = index; dragActive.value = true; document.body.style.cursor = 'move'; };
        const onMouseDragMove = (e) => {
             if (dragIndex.value === null) return;
             const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.group');
             if (!target) return;
             const children = Array.from(target.parentNode.children);
             const itemElements = children.filter(c => c.classList.contains('group'));
             const newIndex = itemElements.indexOf(target);
             if (newIndex !== -1 && newIndex !== dragIndex.value) {
                 const items = days.value[currentDayIndex.value].items;
                 const [movedItem] = items.splice(dragIndex.value, 1);
                 items.splice(newIndex, 0, movedItem);
                 dragIndex.value = newIndex;
             }
        };
        const onMouseDragEnd = () => { dragIndex.value = null; dragActive.value = false; document.body.style.cursor = ''; };
        
        const openMap = (loc) => { 
            if (!loc) return; 
            const cleanLoc = loc.trim();
            const isUrl = /^https?:\/\//i.test(cleanLoc) || 
                          /^www\./i.test(cleanLoc) || 
                          /\.(com|tw|jp|co|gl|net|io|org)\b/i.test(cleanLoc) || 
                          cleanLoc.includes('goo.gl');

            if (isUrl) {
                const finalUrl = /^https?:\/\//i.test(cleanLoc) ? cleanLoc : 'https://' + cleanLoc;
                window.open(finalUrl, '_blank');
            } else {
                const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanLoc)}`;
                window.open(mapUrl, '_blank');
            }
        };

        const renderNote = (note) => { 
            if (!note) return ''; 
            const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|tw|jp|gl)[^\s]*)/gi; 
            return note.replace(urlRegex, (url) => { 
                const href = /^https?:\/\//i.test(url) ? url : 'https://' + url;
                return `<a href="${href}" target="_blank" class="text-theme-accent underline break-all" onclick="event.stopPropagation()">${url}</a>`; 
            }); 
        };
        
        const showToast = (msg) => { toast.value = { show: true, message: msg, type: 'success' }; setTimeout(() => toast.value.show = false, 3000); };
        const triggerConfirm = (title, msg, cb) => { confirmModal.value = { show: true, title, message: msg, callback: cb }; };
        const executeConfirm = () => { if (confirmModal.value.callback) confirmModal.value.callback(); confirmModal.value.show = false; };
        const toTWD = (val) => Math.round(val * exchangeRate.value).toLocaleString();
        
        const getDayDate = (index) => { 
            if(!startDate.value) return ''; 
            const d = new Date(startDate.value); d.setDate(d.getDate() + index); 
            return `${d.getMonth() + 1}/${d.getDate()}`; 
        };
        const getDayOfWeek = (index) => {
            if(!startDate.value) return '';
            const d = new Date(startDate.value);
            d.setDate(d.getDate() + index);
            const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
            return weekdays[d.getDay()];
        };

        const searchGoogleMaps = (q) => q ? openMap(q) : showToast('請輸入地點');
        const detectCurrency = () => { const info = Object.entries(CURRENCY_MAP).find(([k]) => tempDestination.value.toLowerCase().includes(k))?.[1]; if (info) { exchangeRate.value = info.r; currencySymbol.value = info.s; detectedInfo.value = `${info.n} (${info.s}) ≈ ${info.r}`; } };
        const finishWizard = () => { if(!tempDestination.value || !tempStartDate.value) return showToast('請輸入完整資訊'); destination.value = tempDestination.value; startDate.value = tempStartDate.value; showWizard.value = false; if (!detectedInfo.value) detectCurrency(); saveToHistory(TRIP_DOC_ID, destination.value, startDate.value); };
        
        const saveToCloud = debounce(async () => {
            if (isRemoteUpdate.value) return;
            isSyncing.value = true;
            permissionError.value = false; 
            try {
                const dataToSave = {
                    days: JSON.parse(JSON.stringify(days.value)),
                    expenses: JSON.parse(JSON.stringify(expenses.value)),
                    notes: JSON.parse(JSON.stringify(notes.value)),
                    shoppingList: JSON.parse(JSON.stringify(shoppingList.value)), 
                    startDate: startDate.value,
                    destination: destination.value,
                    exchangeRate: exchangeRate.value,
                    currencySymbol: currencySymbol.value,
                    travelers: JSON.parse(JSON.stringify(travelers.value))
                };
                await setDoc(tripDocRef, dataToSave, { merge: true });
                isSyncing.value = false;
            } catch (e) {
                if (e.code === 'permission-denied') permissionError.value = true;
                else showToast("同步失敗，請檢查網路");
                isSyncing.value = false;
            }
        }, 800);

        watch([days, expenses, notes, shoppingList, startDate, destination, exchangeRate, currencySymbol, travelers], () => { if (!isRemoteUpdate.value) saveToCloud(); }, { deep: true });

        const setupFirestoreListener = () => {
            if (unsubscribeSnapshot) return; 
            unsubscribeSnapshot = onSnapshot(tripDocRef, (docSnap) => {
                permissionError.value = false; 
                if (docSnap.exists()) {
                    const d = docSnap.data();
                    isRemoteUpdate.value = true;
                    days.value = d.days || [{items:[]}]; 
                    expenses.value = (d.expenses||[]).map(e => ({...e, beneficiaries: e.beneficiaries || [], type: e.type || 'shared', note: e.note || ''})); 
                    notes.value = (d.notes || []).map(n => ({ ...n, images: n.images || (n.image ? [n.image] : []) }));
                    const currentShops = shoppingList.value.reduce((acc, shop) => { acc[shop.id] = shop; return acc; }, {});
                    let rawShopping = d.shoppingList || [];
                    if (rawShopping.length > 0 && !rawShopping[0].items && !rawShopping[0].shopName) {
                         shoppingList.value = [{ id: 'default_migrated', shopName: '未分類項目', items: rawShopping, expanded: true, tempItemInput: '', tempLinkInput: '', tempNoteInput: '', tempImages: [], showLinkInput: false, showNoteInput: false, isRenaming: false }];
                    } else {
                         shoppingList.value = rawShopping.map(s => {
                             const local = currentShops[s.id];
                             return { ...s, items: (s.items || []).map(i => ({ ...i, images: i.images || (i.image ? [i.image] : []) })), expanded: local ? local.expanded : (s.expanded !== undefined ? s.expanded : true), tempItemInput: local ? local.tempItemInput : '', tempLinkInput: local ? local.tempLinkInput : '', tempNoteInput: local ? local.tempNoteInput : '', tempImages: local ? local.tempImages : [], showLinkInput: local ? local.showLinkInput : false, showNoteInput: local ? local.showNoteInput : false, isRenaming: local ? local.isRenaming : false };
                         });
                    }
                    startDate.value = d.startDate || ''; 
                    destination.value = d.destination || ''; 
                    exchangeRate.value = d.exchangeRate || 0.21; 
                    currencySymbol.value = d.currencySymbol || '¥'; 
                    travelers.value = d.travelers || ['我', '旅伴'];
                    showWizard.value = !(destination.value && startDate.value);
                    
                    if (destination.value && startDate.value) {
                        saveToHistory(TRIP_DOC_ID, destination.value, startDate.value);
                    }
                    
                    nextTick(() => { isRemoteUpdate.value = false; });
                } else { showWizard.value = true; }
            }, (error) => {
                if (error.code === 'permission-denied') permissionError.value = true;
                else showToast("連線資料庫失敗");
            });
        };

        onMounted(() => {
            loadHistory();
            onAuthStateChanged(auth, (user) => {
                if (user) setupFirestoreListener();
                else signInAnonymously(auth).catch(() => setupFirestoreListener());
            });
        });
        
        const retryConnection = () => { location.reload(); }
        const copyRules = () => { navigator.clipboard.writeText(rulesText); showToast("已複製規則！"); };
        
        const confirmResetData = () => triggerConfirm('開啟新旅程', '確定要開啟全新的旅程嗎？這會產生一個全新的網址連結，目前的旅程資料會安全保留在雲端。', () => { 
            window.location.href = window.location.pathname;
        });

        const exportJSON = () => {
            const dataToSave = {
                tripId: TRIP_DOC_ID,
                days: days.value,
                expenses: expenses.value,
                notes: notes.value,
                shoppingList: shoppingList.value,
                startDate: startDate.value,
                destination: destination.value,
                exchangeRate: exchangeRate.value,
                currencySymbol: currencySymbol.value,
                travelers: travelers.value
            };
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToSave));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", `${destination.value || 'Tabi'}_backup.json`);
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
            showToast('原始資料已成功匯出 JSON 備份！');
        };

        const triggerFileInput = (refName) => { const element = instance.refs[refName]; if (element) { if (Array.isArray(element)) element[0].click(); else element.click(); } };
        
        const onNoteImageChange = async (e) => { 
            const files = e.target.files; 
            if (files && files.length > 0) { 
                for (let i = 0; i < files.length; i++) { 
                    const compressed = await compressImage(files[i]); 
                    if(!formNote.value.images) formNote.value.images = []; 
                    formNote.value.images.push(compressed); 
                } 
            } 
            e.target.value = ''; 
        };
        const onShopItemImageChange = async (e, shop) => { 
            const files = e.target.files; 
            if (files && files.length > 0) { 
                if(!shop.tempImages) shop.tempImages = []; 
                for (let i = 0; i < files.length; i++) { 
                    const compressed = await compressImage(files[i]); 
                    shop.tempImages.push(compressed); 
                } 
            } 
            e.target.value = ''; 
        };
        const onEditItemImageChange = async (e) => { 
            const files = e.target.files; 
            if (files && files.length > 0) { 
                if(!editForm.value.images) editForm.value.images = []; 
                for (let i = 0; i < files.length; i++) { 
                    const compressed = await compressImage(files[i]); 
                    editForm.value.images.push(compressed); 
                } 
            } 
            e.target.value = ''; 
        };

        const viewImage = (src) => { viewingImage.value = src; }
        const addDay = () => { days.value.push({ items: [] }); currentDayIndex.value = days.value.length - 1; };
        const confirmDeleteDay = () => days.value.length <= 1 ? showToast('最少保留一天') : triggerConfirm('刪除', `刪除 Day ${currentDayIndex.value+1}?`, () => { days.value.splice(currentDayIndex.value, 1); currentDayIndex.value = Math.min(currentDayIndex.value, days.value.length-1); });
        const confirmDeleteItem = (id) => triggerConfirm('刪除', '確定刪除此行程？', () => days.value[currentDayIndex.value].items = days.value[currentDayIndex.value].items.filter(i => i.id !== id));
        const confirmDeleteExpense = (id) => triggerConfirm('刪除', '確定刪除？', () => { expenses.value = expenses.value.filter(e => e.id !== id); showExpenseModal.value = false; });
        const confirmDeleteNote = (id) => triggerConfirm('刪除', '確定刪除？', () => { notes.value = notes.value.filter(n => n.id !== id); showNoteModal.value = false; });
        
        const onFabClick = () => {
            if(currentTab.value === 'schedule') { formItem.value = { id: Date.now(), time: '09:00', title: '', location: '', note: '', dayIndex: currentDayIndex.value, originalDayIndex: currentDayIndex.value }; tempHour.value='09'; tempMinute.value='00'; isEditing.value = false; showItemModal.value = true; }
            if(currentTab.value === 'money') { const now = new Date(); const dateStr = now.toISOString().split('T')[0]; const h = String(now.getHours()).padStart(2, '0'); const m = String(now.getMinutes()).padStart(2, '0'); formExpense.value = { id: Date.now(), title: '', amount: '', payer: travelers.value[0], beneficiaries: [], type: 'shared', date: dateStr, time: `${h}:${m}`, note: '' }; tempHourExp.value = String(h).padStart(2, '0'); tempMinuteExp.value = String(m).padStart(2, '0'); isExpenseEditing.value = false; showExpenseModal.value = true; }
            if(currentTab.value === 'memo') { formNote.value = { id: Date.now(), title: '', content: '', images: [] }; isNoteEditing.value = false; showNoteModal.value = true; }
        };

        const saveItem = () => { if(!formItem.value.title) return showToast('請輸入名稱'); const newItem = { ...formItem.value, time: `${tempHour.value}:${tempMinute.value}` }; const targetDayIndex = newItem.dayIndex; delete newItem.dayIndex; delete newItem.originalDayIndex; if(isEditing.value) { if (targetDayIndex !== formItem.value.originalDayIndex) { const oldItems = days.value[formItem.value.originalDayIndex].items; const oldIdx = oldItems.findIndex(i => i.id === formItem.value.id); if (oldIdx !== -1) oldItems.splice(oldIdx, 1); days.value[targetDayIndex].items.push(newItem); } else { const items = days.value[formItem.value.originalDayIndex].items; const idx = items.findIndex(i => i.id === formItem.value.id); if (idx !== -1) items.splice(idx, 1, newItem); } } else { days.value[targetDayIndex].items.push(newItem); } days.value[targetDayIndex].items.sort((a, b) => a.time.localeCompare(b.time)); showItemModal.value = false; };
        const toggleBeneficiary = (name) => { if (!formExpense.value.beneficiaries) formExpense.value.beneficiaries = []; if (formExpense.value.type === 'shared') { if (formExpense.value.beneficiaries.length === 0) formExpense.value.beneficiaries = travelers.value.filter(t => t !== name); else { const idx = formExpense.value.beneficiaries.indexOf(name); if (idx > -1) formExpense.value.beneficiaries.splice(idx, 1); else formExpense.value.beneficiaries.push(name); } if (formExpense.value.beneficiaries.length === travelers.value.length) formExpense.value.beneficiaries = []; } };
        const saveExpense = () => { if(!formExpense.value.title || !formExpense.value.amount) return showToast('請輸入完整資訊'); let benes = formExpense.value.beneficiaries || []; if (formExpense.value.type === 'shared' && benes.length === 0) benes = []; formExpense.value.time = `${tempHourExp.value}:${tempMinuteExp.value}`; const newExp = { ...formExpense.value, beneficiaries: benes }; if(isExpenseEditing.value) { const idx = expenses.value.findIndex(e => e.id === formExpense.value.id); if(idx !== -1) expenses.value.splice(idx, 1, newExp); } else { expenses.value.unshift(newExp); } showExpenseModal.value = false; };
        const saveNote = () => { if(!formNote.value.title) return showToast('請輸入標題'); const now = new Date(); const newNote = { ...formNote.value, updatedAt: now }; if(isNoteEditing.value) { const idx = notes.value.findIndex(n => n.id === formNote.value.id); if(idx !== -1) notes.value.splice(idx, 1, newNote); } else { notes.value.unshift(newNote); } showNoteModal.value = false; };
        const addShop = () => { if (!newShopName.value.trim()) return; shoppingList.value.push({ id: Date.now(), shopName: newShopName.value, items: [], tempItemInput: '', tempLinkInput: '', tempNoteInput: '', tempImages: [], showLinkInput: false, showNoteInput: false, expanded: true, isRenaming: false }); newShopName.value = ''; };
        const toggleShop = (shop) => { if (!shop.isRenaming) shop.expanded = !shop.expanded; };
        const removeShop = (id) => triggerConfirm('刪除店家', '確定刪除此店家及其所有商品？', () => { shoppingList.value = shoppingList.value.filter(s => s.id !== id); });
        const enableShopRename = (shop) => { shop.isRenaming = true; nextTick(() => { }); };
        const saveShopRename = (shop) => { if (!shop.shopName.trim()) shop.shopName = "未命名店家"; shop.isRenaming = false; };
        const addItemToShop = (shop) => { if (!shop.tempItemInput || !shop.tempItemInput.trim()) return; shop.items.push({ id: Date.now(), text: shop.tempItemInput, link: shop.tempLinkInput || '', note: shop.tempNoteInput || '', images: shop.tempImages || [], done: false }); shop.tempItemInput = ''; shop.tempLinkInput = ''; shop.tempNoteInput = ''; shop.tempImages = []; shop.showLinkInput = false; shop.showNoteInput = false; };
        const openEditItemModal = (shopId, item) => { editForm.value = { shopId: shopId, itemId: item.id, text: item.text, link: item.link, note: item.note, images: [...(item.images || [])] }; showShoppingEditModal.value = true; };
        const saveEditItem = () => { const shop = shoppingList.value.find(s => s.id === editForm.value.shopId); if (shop) { const item = shop.items.find(i => i.id === editForm.value.itemId); if (item) { item.text = editForm.value.text; item.link = editForm.value.link; item.note = editForm.value.note; item.images = editForm.value.images; } } showShoppingEditModal.value = false; };
        const removeItem = (shopId, itemId) => { const shop = shoppingList.value.find(s => s.id === shopId); if (shop) shop.items = shop.items.filter(i => i.id !== itemId); };
        const toggleItem = (shopId, item) => { item.done = !item.done; };
        const editItem = (item) => { formItem.value = {...item, dayIndex: currentDayIndex.value, originalDayIndex: currentDayIndex.value}; [tempHour.value, tempMinute.value] = item.time.split(':'); isEditing.value=true; showItemModal.value=true; };
        const editExpense = (exp) => { formExpense.value = {...exp}; if (!formExpense.value.beneficiaries) formExpense.value.beneficiaries = []; if(exp.time) [tempHourExp.value, tempMinuteExp.value] = exp.time.split(':'); isExpenseEditing.value=true; showExpenseModal.value=true; };
        const editNote = (note) => { formNote.value = {...note}; isNoteEditing.value=true; showNoteModal.value=true; };
        const closeAllModals = () => { showItemModal.value = false; showExpenseModal.value = false; showNoteModal.value = false; showSettingsModal.value = false; showTravelerModal.value = false; showShoppingEditModal.value = false; showHistoryModal.value = false; };
        const getModalTitle = () => { if(showItemModal.value) return isEditing.value ? 'Edit Event' : 'New Event'; if(showExpenseModal.value) return isExpenseEditing.value ? 'Edit Expense' : 'New Expense'; if(showNoteModal.value) return isNoteEditing.value ? 'Edit Note' : 'New Note'; if(showSettingsModal.value) return 'Settings'; if(showTravelerModal.value) return 'Travelers'; if(showShoppingEditModal.value) return 'Edit Item'; };
        const onDateDragStart = (e) => { dragState.value = { isDown: true, startX: e.pageX - dateContainer.value.offsetLeft, scrollLeft: dateContainer.value.scrollLeft }; };
        const onDateDragMove = (e) => { if (!dragState.value.isDown) return; e.preventDefault(); dateContainer.value.scrollLeft = dragState.value.scrollLeft - (e.pageX - dateContainer.value.offsetLeft - dragState.value.startX) * 2; };
        const onDateDragEnd = () => dragState.value.isDown = false;
        const getMemberDetails = (name) => { const sharedPart = statistics.value.shared / (travelers.value.length || 1); const privatePart = statistics.value.individual[name] || 0; return { total: sharedPart + privatePart, shared: sharedPart, private: privatePart }; };

        const debts = computed(() => {
            let balances = {}; travelers.value.forEach(t => balances[t] = 0);
            expenses.value.forEach(exp => { const amt = Number(exp.amount), payer = exp.payer; if (balances[payer] === undefined) balances[payer] = 0; let benes = exp.type === 'shared' ? (exp.beneficiaries.length > 0 ? exp.beneficiaries : travelers.value) : (exp.beneficiaries.length > 0 ? exp.beneficiaries : [payer]); const split = amt / benes.length; balances[payer] += amt; benes.forEach(b => { if (balances[b] !== undefined) balances[b] -= split; }); });
            let result = [], debtors = [], creditors = [];
            for (const [p, a] of Object.entries(balances)) { if (a < -1) debtors.push({ p, a }); if (a > 1) creditors.push({ p, a }); }
            debtors.sort((a, b) => a.a - b.a); creditors.sort((a, b) => b.a - a.a);
            let i = 0, j = 0; while (i < debtors.length && j < creditors.length) { let d = debtors[i], c = creditors[j], amt = Math.min(Math.abs(d.a), c.a); result.push({ from: d.p, to: c.p, amount: Math.round(amt) }); d.a += amt; c.a -= amt; if (Math.abs(d.a) < 1) i++; if (c.a < 1) j++; } return result;
        });
        
        const groupedExpenses = computed(() => {
            const groups = {}; filteredExpenses.value.forEach(exp => { const dateKey = exp.date || 'no-date'; if (!groups[dateKey]) groups[dateKey] = []; groups[dateKey].push(exp); });
            return Object.keys(groups).sort((a, b) => (a === 'no-date' ? 1 : b === 'no-date' ? -1 : b.localeCompare(a))).map(date => { const d = new Date(date); const days = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']; const displayDate = date === 'no-date' ? '未設定日期' : `${d.getMonth() + 1}月${d.getDate()}日 ${days[d.getDay()]}`; const items = groups[date]; const total = items.reduce((sum, item) => sum + Number(item.amount), 0); return { date, displayDate, items, total }; });
        });

        const openTravelerModal = () => { editingTravelers.value = [...travelers.value]; showTravelerModal.value = true; };
        const addTraveler = () => { editingTravelers.value.push(`旅伴${editingTravelers.value.length + 1}`); };
        const removeTraveler = (idx) => { if (editingTravelers.value.length > 1) { editingTravelers.value.splice(idx, 1); } else { showToast('At least one traveler required'); } };
        const saveTravelers = () => { const oldTravelers = [...travelers.value]; const newTravelers = [...editingTravelers.value]; expenses.value.forEach(exp => { const payerIdx = oldTravelers.indexOf(exp.payer); if (payerIdx !== -1 && payerIdx < newTravelers.length) exp.payer = newTravelers[payerIdx]; if (exp.beneficiaries && exp.beneficiaries.length > 0) exp.beneficiaries = exp.beneficiaries.map(b => { const bIdx = oldTravelers.indexOf(b); return (bIdx !== -1 && bIdx < newTravelers.length) ? newTravelers[bIdx] : b; }).filter(b => newTravelers.includes(b)); }); travelers.value = newTravelers; showTravelerModal.value = false; showToast('Travelers Updated'); };

        // -------------------------------------------------------------------
        // 修正 3：重新設計 PDF 匯出版面，改用專業「表格化設計」並加入「最終結算」
        // -------------------------------------------------------------------
        const exportPDF = () => {
            showToast('Generating PDF...'); 
            const element = document.createElement('div'); 
            element.style.padding = '30px'; 
            element.style.fontFamily = '"Noto Serif TC", "Noto Sans TC", sans-serif'; 
            element.style.color = '#2C3032';
            
            // 標題區塊
            let html = `
                <div style="text-align:center; margin-bottom: 40px;">
                    <h1 style="font-size:36px; font-weight:900; margin-bottom:5px; color:#2C3032; letter-spacing: 2px;">${destination.value || 'Trip'}</h1>
                    <p style="font-size:12px; color:#C5A059; letter-spacing:4px; text-transform:uppercase; font-weight:bold;">Travel Report & Accounting</p>
                    <p style="font-size:12px; color:#9CA3AF; margin-top:5px;">${startDate.value}</p>
                </div>
            `;
            
            // 1. 行程表區塊 (表格化)
            html += `<h2 style="font-size:20px; border-bottom: 2px solid #C5A059; padding-bottom: 8px; margin-bottom:20px; color:#2C3032;">Schedule</h2>`;
            days.value.forEach((day, idx) => {
                html += `<div style="margin-bottom: 20px; border: 1px solid #E0E0E0; border-radius: 8px; overflow:hidden;">`;
                html += `<div style="background-color: #F4F2EE; padding: 10px 15px; border-bottom: 1px solid #E0E0E0;"><h3 style="font-size:15px; margin: 0; color: #2C3032; font-weight:bold;">Day ${idx + 1} - ${getDayDate(idx)} <span style="font-size:12px; font-weight:normal; color:#5F6368; margin-left:8px;">${getDayOfWeek(idx)}</span></h3></div>`;
                
                if (day.items.length === 0) {
                     html += `<div style="padding: 15px; font-size: 13px; color: #9CA3AF; text-align:center;">No events scheduled.</div>`;
                } else { 
                    html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`; 
                    day.items.forEach((item, i) => { 
                        let bg = i % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
                        html += `<tr style="background-color: ${bg}; border-bottom: 1px solid #EEEEEE;">
                                    <td style="padding: 12px 15px; width: 20%; vertical-align: top; font-weight:bold; color:#C5A059;">${item.time}</td>
                                    <td style="padding: 12px 15px; width: 80%; vertical-align: top;">
                                        <div style="font-weight:bold; color:#2C3032; font-size:14px; margin-bottom:4px;">${item.title}</div>
                                        ${item.location ? `<div style="font-size:11px; color:#5F6368; margin-bottom:2px;">📍 ${item.location}</div>` : ''}
                                        ${item.note ? `<div style="font-size:11px; color:#9CA3AF;">📝 ${item.note}</div>` : ''}
                                    </td>
                                 </tr>`; 
                    }); 
                    html += `</table>`; 
                }
                html += `</div>`;
            });

            // 換頁
            html += `<div class="html2pdf__page-break"></div>`;
            
            // 2. 財務總結區塊
            html += `<div style="page-break-before: always; padding-top: 20px;">`;
            html += `<h2 style="font-size:22px; border-bottom: 2px solid #C5A059; padding-bottom: 10px; margin-bottom:20px; color:#2C3032;">Financial Summary</h2>`;

            // 總花費
            html += `
                <div style="background-color: #F4F2EE; padding: 20px; border-radius: 12px; margin-bottom: 20px; text-align:center;">
                    <p style="font-size: 12px; color: #5F6368; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px;">Grand Total</p>
                    <p style="font-size: 28px; font-weight: bold; color: #2C3032; margin:0;">${currencySymbol.value} ${totalExpense.value.toLocaleString()}</p>
                    <p style="font-size: 12px; color: #9CA3AF; margin-top:5px;">≈ NT$ ${toTWD(totalExpense.value)}</p>
                </div>
            `;

            // 成員分攤 與 最終結算 (左右並排)
            html += `<div style="display:flex; justify-content: space-between; margin-bottom: 30px; gap: 20px;">`;
            
            // 左側：Member Expenses
            html += `<div style="flex: 1; border: 1px solid #E0E0E0; border-radius: 12px; padding: 15px;">`;
            html += `<h3 style="font-size:14px; color: #5F6368; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; text-align:center;">Member Share (個人分攤)</h3>`;
            travelers.value.forEach(t => {
                const memberTotal = getMemberDetails(t).total;
                html += `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                            <span><strong>${t}</strong></span>
                            <span>${currencySymbol.value} ${Math.round(memberTotal).toLocaleString()}</span>
                         </div>`;
            });
            html += `</div>`;

            // 右側：Settlement (結算)
            html += `<div style="flex: 1; border: 1px solid #E0E0E0; border-radius: 12px; padding: 15px; background-color: #FAFAFA;">`;
            html += `<h3 style="font-size:14px; color: #5F6368; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px; text-align:center;">Settlement (最終結算)</h3>`;
            if (debts.value.length > 0) {
                debts.value.forEach(debt => {
                    html += `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 13px; padding-bottom: 8px; border-bottom: 1px dashed #eee;">
                                <span><strong>${debt.from}</strong> <span style="color:#C5A059; font-size:10px; margin:0 4px; font-weight:bold;">給</span> <strong>${debt.to}</strong></span>
                                <span style="color:#A65652; font-weight:bold;">${currencySymbol.value} ${debt.amount.toLocaleString()}</span>
                             </div>`;
                });
            } else {
                 html += `<div style="text-align:center; color:#9CA3AF; font-size: 12px; margin-top:20px;">無須結算</div>`;
            }
            html += `</div>`;
            html += `</div>`; // 結束左右並排

            // 3. 支出明細區塊 (表格化)
            html += `<h2 style="font-size:18px; color: #2C3032; border-bottom: 2px solid #E0E0E0; padding-bottom: 10px; margin-bottom: 15px; margin-top:30px;">Expense Details (支出明細)</h2>`;

            if (groupedExpenses.value.length > 0) {
                groupedExpenses.value.forEach(group => {
                    html += `<div style="margin-bottom: 20px; page-break-inside: avoid;">`;
                    // 日期標題
                    html += `<div style="background-color: #5F6368; color: white; padding: 8px 12px; font-size: 13px; font-weight: bold; border-radius: 6px 6px 0 0; display:flex; justify-content: space-between;">
                                <span>${group.displayDate}</span>
                                <span>Subtotal: ${currencySymbol.value} ${group.total.toLocaleString()}</span>
                             </div>`;

                    // 表格內容
                    html += `<table style="width: 100%; border-collapse: collapse; font-size: 12px; border-left: 1px solid #E0E0E0; border-right: 1px solid #E0E0E0; border-bottom: 1px solid #E0E0E0;">`;
                    group.items.forEach((exp, i) => {
                        let typeText = exp.type === 'shared' ? '共同' : (exp.type === 'individual' && exp.beneficiaries?.[0] !== exp.payer ? '代墊' : '自費');
                        let bg = i % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
                        html += `
                            <tr style="background-color: ${bg}; border-bottom: 1px solid #EEEEEE;">
                                <td style="padding: 10px 12px; width: 45%; vertical-align: middle;">
                                    <div style="font-weight:bold; color:#2C3032; font-size:13px;">${exp.title}</div>
                                    ${exp.note ? `<div style="color:#9CA3AF; font-size:10px; margin-top:3px;">📝 ${exp.note}</div>` : ''}
                                </td>
                                <td style="padding: 10px 12px; width: 30%; color: #5F6368; vertical-align: middle;">
                                    ${exp.payer}付款 <span style="font-size:10px; background:#eee; padding:2px 6px; border-radius:4px; margin-left:4px;">${typeText}</span>
                                </td>
                                <td style="padding: 10px 12px; width: 25%; text-align: right; font-weight:bold; color:#2C3032; font-size:13px; vertical-align: middle;">
                                    ${currencySymbol.value} ${Number(exp.amount).toLocaleString()}
                                </td>
                            </tr>
                        `;
                    });
                    html += `</table></div>`;
                });
            } else {
                html += `<p style="font-size: 13px; color: #9CA3AF; text-align:center; padding: 20px;">No expense records.</p>`;
            }
            
            html += `</div>`; 
            element.innerHTML = html;
            
            const opt = { 
                margin: [15, 15, 15, 15], 
                filename: `${destination.value || 'Trip'}_Report.pdf`, 
                image: { type: 'jpeg', quality: 0.98 }, 
                html2canvas: { scale: 2, useCORS: true }, 
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, 
                pagebreak: { mode: ['css', 'legacy'] } 
            };
            html2pdf().set(opt).from(element).save().then(() => { showToast('PDF Exported Successfully!'); showSettingsModal.value = false; });
        };

        return { 
            currentTab, currentDayIndex, days, currentDayItems, totalExpense, filteredExpenses, notes, sortedNotes, destination, currencySymbol, startDate, exchangeRate, showWizard, tempDestination, tempStartDate, detectedInfo, finishWizard, detectCurrency, showItemModal, showExpenseModal, showSettingsModal, showNoteModal, closeAllModals, getModalTitle, formItem, formExpense, formNote, tempHour, tempMinute, travelers, saveItem, saveExpense, saveNote, editItem, editExpense, editNote, confirmDeleteItem, confirmDeleteExpense, confirmDeleteNote, onFabClick, confirmResetData, addDay, confirmDeleteDay, openMap, searchGoogleMaps, renderNote, toast, confirmModal, executeConfirm, toTWD, getDayDate,
            getDayOfWeek, toggleExpand, expandedItemId, isEditing, isExpenseEditing, isNoteEditing, onTouchDragStart, onTouchDragMove, onTouchDragEnd, dragIndex, dateContainer, onDateDragStart, onDateDragMove, onDateDragEnd, getMemberDetails, statistics, debts, toggleBeneficiary, groupedExpenses, tempHourExp, tempMinuteExp, showMemberStats, collapsedDates, toggleDateGroup, showTravelerModal, openTravelerModal, editingTravelers, addTraveler, removeTraveler, saveTravelers, isSyncing, permissionError, retryConnection, rulesText, copyRules, expandedNoteId, toggleExpandNote, onMouseDragStart, onMouseDragMove, onMouseDragEnd, shoppingList, newShopName, addShop, removeShop, addItemToShop, removeItem, toggleItem, toggleShop, enableShopRename, saveShopRename, showShoppingEditModal, editForm, openEditItemModal, saveEditItem, onNoteImageChange, onShopItemImageChange, onEditItemImageChange, viewingImage, viewImage, triggerFileInput, exportPDF, exportJSON,
            TRIP_DOC_ID, showHistoryModal, tripHistory, switchTrip, deleteFromHistory, copyShareLink, formatUrl
        };
    }
}).mount('#app');
