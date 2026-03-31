import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { createApp, ref, computed, onMounted, watch, nextTick, getCurrentInstance } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

// ----------------------------------------------------
// 1. Firebase Configuration & Initialization
// ----------------------------------------------------
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

const TRIP_DOC_ID = "shared_trip_data"; 
const tripDocRef = doc(db, "trips", TRIP_DOC_ID);

// ----------------------------------------------------
// 2. Constants & Helpers
// ----------------------------------------------------
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
        const showItemModal = ref(false), showExpenseModal = ref(false), showSettingsModal = ref(false), showNoteModal = ref(false), showTravelerModal = ref(false);
        const isEditing = ref(false), isNoteEditing = ref(false), isExpenseEditing = ref(false);
        const expenseFilter = ref('all');
        const toast = ref({ show: false, message: '', type: 'success' });
        const confirmModal = ref({ show: false, title: '', message: '', callback: null });
        const expandedItemId = ref(null);
        const expandedNoteId = ref(null); 
        const expandedDates = ref([]); 
        const editingTravelers = ref([]);
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

        const compressImage = (file) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const MAX_DIM = 1600; 
                        let width = img.width; let height = img.height;
                        if (width > height) { if (width > MAX_DIM) { height *= MAX_DIM / width; width = MAX_DIM; } }
                        else { if (height > MAX_DIM) { width *= MAX_DIM / height; height = MAX_DIM; } }
                        canvas.width = width; canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        let quality = 0.9;
                        let dataUrl = canvas.toDataURL('image/jpeg', quality);
                        const MAX_CHAR_LENGTH = 1200000; 
                        while (dataUrl.length > MAX_CHAR_LENGTH && quality > 0.5) { quality -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', quality); }
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

        const getDayDate = (index) => { 
            if(!startDate.value) return ''; 
            const d = new Date(startDate.value); 
            d.setDate(d.getDate() + index); 
            // 新增：顯示星期幾
            const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
            return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`; 
        };

        const saveToCloud = debounce(async () => {
            if (isRemoteUpdate.value) return;
            isSyncing.value = true;
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
                isSyncing.value = false;
            }
        }, 800);

        watch([days, expenses, notes, shoppingList, startDate, destination, exchangeRate, currencySymbol, travelers], () => {
            if (!isRemoteUpdate.value) saveToCloud();
        }, { deep: true });

        const setupFirestoreListener = () => {
            if (unsubscribeSnapshot) return; 
            unsubscribeSnapshot = onSnapshot(tripDocRef, (docSnap) => {
                permissionError.value = false; 
                if (docSnap.exists()) {
                    const d = docSnap.data();
                    isRemoteUpdate.value = true;
                    days.value = d.days || [{items:[]}]; 
                    expenses.value = (d.expenses||[]).map(e => ({...e, beneficiaries: e.beneficiaries || [], type: e.type || 'shared'})); 
                    notes.value = (d.notes || []).map(n => ({...n, images: n.images || (n.image ? [n.image] : []) }));
                    
                    const currentShops = shoppingList.value.reduce((acc, shop) => { acc[shop.id] = shop; return acc; }, {});
                    let rawShopping = d.shoppingList || [];
                    shoppingList.value = rawShopping.map(s => {
                        const local = currentShops[s.id];
                        return { ...s, items: (s.items || []).map(i => ({...i, images: i.images || (i.image ? [i.image] : []) })),
                            expanded: local ? local.expanded : (s.expanded !== undefined ? s.expanded : true),
                            tempItemInput: local ? local.tempItemInput : '', tempImages: local ? local.tempImages : []
                        };
                    });

                    startDate.value = d.startDate || ''; 
                    destination.value = d.destination || ''; 
                    exchangeRate.value = d.exchangeRate || 0.21; 
                    currencySymbol.value = d.currencySymbol || '¥'; 
                    travelers.value = d.travelers || ['我', '旅伴'];
                    showWizard.value = !(destination.value && startDate.value);
                    nextTick(() => isRemoteUpdate.value = false);
                } else { showWizard.value = true; }
            });
        };

        onMounted(() => {
            onAuthStateChanged(auth, (user) => {
                if (user) setupFirestoreListener();
                else signInAnonymously(auth).catch(() => setupFirestoreListener());
            });
        });

        const showToast = (msg) => { toast.value = { show: true, message: msg, type: 'success' }; setTimeout(() => toast.value.show = false, 3000); };
        const triggerConfirm = (title, msg, cb) => { confirmModal.value = { show: true, title, message: msg, callback: cb }; };
        const executeConfirm = () => { if (confirmModal.value.callback) confirmModal.value.callback(); confirmModal.value.show = false; };
        const toTWD = (val) => Math.round(val * exchangeRate.value).toLocaleString();
        
        const onFabClick = () => {
            if(currentTab.value === 'schedule') { formItem.value = { id: Date.now(), time: '09:00', title: '', location: '', note: '', dayIndex: currentDayIndex.value, originalDayIndex: currentDayIndex.value }; tempHour.value='09'; tempMinute.value='00'; isEditing.value = false; showItemModal.value = true; }
            if(currentTab.value === 'money') { 
                const now = new Date();
                formExpense.value = { id: Date.now(), title: '', amount: '', payer: travelers.value[0], beneficiaries: [], type: 'shared', date: now.toISOString().split('T')[0], time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` }; 
                tempHourExp.value = String(now.getHours()).padStart(2,'0'); tempMinuteExp.value = String(now.getMinutes()).padStart(2,'0');
                isExpenseEditing.value = false; showExpenseModal.value = true; 
            }
            if(currentTab.value === 'memo') { formNote.value = { id: Date.now(), title: '', content: '', images: [] }; isNoteEditing.value = false; showNoteModal.value = true; }
        };

        const saveItem = () => {
            if(!formItem.value.title) return showToast('請輸入名稱');
            const newItem = { ...formItem.value, time: `${tempHour.value}:${tempMinute.value}` };
            const targetIdx = newItem.dayIndex;
            delete newItem.dayIndex; delete newItem.originalDayIndex;
            if(isEditing.value) {
                if (targetIdx !== formItem.value.originalDayIndex) {
                    days.value[formItem.value.originalDayIndex].items = days.value[formItem.value.originalDayIndex].items.filter(i => i.id !== formItem.value.id);
                    days.value[targetIdx].items.push(newItem);
                } else {
                    const idx = days.value[targetIdx].items.findIndex(i => i.id === formItem.value.id);
                    if (idx !== -1) days.value[targetIdx].items.splice(idx, 1, newItem);
                }
            } else { days.value[targetIdx].items.push(newItem); }
            days.value[targetIdx].items.sort((a, b) => a.time.localeCompare(b.time));
            showItemModal.value = false;
        };

        const saveExpense = () => {
            if(!formExpense.value.title || !formExpense.value.amount) return showToast('請輸入完整資訊');
            formExpense.value.time = `${tempHourExp.value}:${tempMinuteExp.value}`;
            if(isExpenseEditing.value) { 
                const idx = expenses.value.findIndex(e => e.id === formExpense.value.id);
                if(idx !== -1) expenses.value.splice(idx, 1, { ...formExpense.value }); 
            } else { expenses.value.unshift({ ...formExpense.value }); }
            showExpenseModal.value = false;
        };

        const saveNote = () => {
             if(!formNote.value.title) return showToast('請輸入標題');
             if(isNoteEditing.value) { 
                 const idx = notes.value.findIndex(n => n.id === formNote.value.id);
                 if(idx !== -1) notes.value.splice(idx, 1, { ...formNote.value, updatedAt: new Date() }); 
             } else { notes.value.unshift({ ...formNote.value, updatedAt: new Date() }); }
             showNoteModal.value = false;
        };

        const debts = computed(() => {
            let balances = {}; travelers.value.forEach(t => balances[t] = 0);
            expenses.value.forEach(exp => {
                const amt = Number(exp.amount);
                let benes = exp.type === 'shared' ? (exp.beneficiaries.length > 0 ? exp.beneficiaries : travelers.value) : (exp.beneficiaries.length > 0 ? exp.beneficiaries : [exp.payer]);
                const split = amt / benes.length;
                balances[exp.payer] += amt;
                benes.forEach(b => { balances[b] -= split; });
            });
            let res = [], debtors = [], creditors = [];
            for (let p in balances) { if (balances[p] < -1) debtors.push({p, a: balances[p]}); if (balances[p] > 1) creditors.push({p, a: balances[p]}); }
            debtors.sort((a,b) => a.a - b.a); creditors.sort((a,b) => b.a - a.a);
            let i=0, j=0;
            while(i<debtors.length && j<creditors.length) {
                let amt = Math.min(Math.abs(debtors[i].a), creditors[j].a);
                res.push({from: debtors[i].p, to: creditors[j].p, amount: Math.round(amt)});
                debtors[i].a += amt; creditors[j].a -= amt;
                if(Math.abs(debtors[i].a)<1) i++; if(creditors[j].a<1) j++;
            }
            return res;
        });

        const groupedExpenses = computed(() => {
            const groups = {};
            filteredExpenses.value.forEach(exp => {
                const key = exp.date || 'no-date';
                if(!groups[key]) groups[key] = [];
                groups[key].push(exp);
            });
            return Object.keys(groups).sort((a,b) => b.localeCompare(a)).map(date => {
                const items = groups[date];
                return { date, displayDate: date === 'no-date' ? '未設定' : date, items, total: items.reduce((s,i)=>s+Number(i.amount), 0) };
            });
        });

        return { 
            currentTab, currentDayIndex, days, currentDayItems, totalExpense, filteredExpenses, notes, destination, currencySymbol, startDate, exchangeRate, 
            showWizard, tempDestination, tempStartDate, detectedInfo, finishWizard, detectCurrency: () => {},
            showItemModal, showExpenseModal, showSettingsModal, showNoteModal, closeAllModals: () => { 
                showItemModal.value = showExpenseModal.value = showNoteModal.value = showSettingsModal.value = showTravelerModal.value = showShoppingEditModal.value = false; 
            },
            formItem, formExpense, formNote, tempHour, tempMinute, travelers,
            saveItem, saveExpense, saveNote, onFabClick, toTWD, getDayDate,
            toggleExpand, expandedItemId, isEditing, isExpenseEditing, isNoteEditing,
            isSyncing, permissionError, expandedNoteId, toggleExpandNote,
            shoppingList, newShopName, addShop: () => {}, exportPDF: () => {},
            statistics, debts, groupedExpenses, tempHourExp, tempMinuteExp, showMemberStats: ref(true), collapsedDates: ref([]),
            showTravelerModal, editingTravelers, viewingImage: ref(null), 
            openMap: (l) => window.open(l.startsWith('http')?l:`https://www.google.com/maps/search/${encodeURIComponent(l)}`, '_blank'),
            renderNote: (n) => n, toast, confirmModal, executeConfirm,
            showShoppingEditModal: ref(false), editForm: ref({}), rulesText, retryConnection: () => location.reload(), copyRules: () => {},
            onDateDragStart: () => {}, onDateDragMove: () => {}, onDateDragEnd: () => {}, 
            onTouchDragStart: () => {}, onTouchDragMove: () => {}, onTouchDragEnd: () => {},
            onMouseDragStart: () => {}, onMouseDragMove: () => {}, onMouseDragEnd: () => {},
            toggleBeneficiary: () => {}, toggleDateGroup, openTravelerModal: () => {}, addTraveler: () => {}, removeTraveler: () => {}, saveTravelers: () => {},
            confirmDeleteDay: () => {}, addDay: () => {}, confirmDeleteItem: () => {}, confirmDeleteExpense: () => {}, confirmDeleteNote: () => {},
            searchGoogleMaps: () => {}
        };
    }
}).mount('#app');
