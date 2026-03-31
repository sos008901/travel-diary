import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { createApp, ref, computed, onMounted, watch, nextTick, getCurrentInstance } from "https://unpkg.com/vue@3/dist/vue.esm-browser.js";

// Firebase 配置
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

        // 核心修改：增加星期顯示
        const getDayDate = (index) => { 
            if(!startDate.value) return ''; 
            const d = new Date(startDate.value); 
            d.setDate(d.getDate() + index); 
            const weekdays = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
            return `${d.getMonth() + 1}/${d.getDate()} (${weekdays[d.getDay()]})`; 
        };

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
                        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                        let quality = 0.9; let dataUrl = canvas.toDataURL('image/jpeg', quality);
                        while (dataUrl.length > 1200000 && quality > 0.5) { quality -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', quality); }
                        resolve(dataUrl); 
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        };

        const currentDayItems = computed(() => days.value[currentDayIndex.value]?.items || []);
        const totalExpense = computed(() => expenses.value.reduce((sum, exp) => sum + Number(exp.amount), 0));
        const filteredExpenses = computed(() => (expenseFilter.value === 'all' ? [...expenses.value] : expenses.value.filter(e => e.type === expenseFilter.value)).sort((a, b) => b.id - a.id));
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

        const saveToCloud = debounce(async () => {
            if (isRemoteUpdate.value) return; isSyncing.value = true;
            try {
                const dataToSave = { days: JSON.parse(JSON.stringify(days.value)), expenses: JSON.parse(JSON.stringify(expenses.value)), notes: JSON.parse(JSON.stringify(notes.value)), shoppingList: JSON.parse(JSON.stringify(shoppingList.value)), startDate: startDate.value, destination: destination.value, exchangeRate: exchangeRate.value, currencySymbol: currencySymbol.value, travelers: JSON.parse(JSON.stringify(travelers.value)) };
                await setDoc(tripDocRef, dataToSave, { merge: true }); isSyncing.value = false;
            } catch (e) { if (e.code === 'permission-denied') permissionError.value = true; isSyncing.value = false; }
        }, 800);

        watch([days, expenses, notes, shoppingList, startDate, destination, exchangeRate, currencySymbol, travelers], () => { if (!isRemoteUpdate.value) saveToCloud(); }, { deep: true });

        const setupFirestoreListener = () => {
            if (unsubscribeSnapshot) return; 
            unsubscribeSnapshot = onSnapshot(tripDocRef, (docSnap) => {
                permissionError.value = false; 
                if (docSnap.exists()) {
                    const d = docSnap.data(); isRemoteUpdate.value = true;
                    days.value = d.days || [{items:[]}]; 
                    expenses.value = (d.expenses||[]).map(e => ({...e, beneficiaries: e.beneficiaries || [], type: e.type || 'shared'})); 
                    notes.value = (d.notes || []).map(n => ({...n, images: n.images || (n.image ? [n.image] : []) }));
                    const currentShops = shoppingList.value.reduce((acc, shop) => { acc[shop.id] = shop; return acc; }, {});
                    shoppingList.value = (d.shoppingList || []).map(s => {
                        const local = currentShops[s.id];
                        return { ...s, items: (s.items || []).map(i => ({...i, images: i.images || (i.image ? [i.image] : []) })), expanded: local ? local.expanded : (s.expanded !== undefined ? s.expanded : true), tempItemInput: local ? local.tempItemInput : '', tempImages: local ? local.tempImages : [] };
                    });
                    startDate.value = d.startDate || ''; destination.value = d.destination || ''; 
                    exchangeRate.value = d.exchangeRate || 0.21; currencySymbol.value = d.currencySymbol || '¥'; 
                    travelers.value = d.travelers || ['我', '旅伴'];
                    showWizard.value = !(destination.value && startDate.value);
                    nextTick(() => isRemoteUpdate.value = false);
                } else { showWizard.value = true; }
            });
        };

        onMounted(() => { onAuthStateChanged(auth, (user) => { if (user) setupFirestoreListener(); else signInAnonymously(auth).catch(() => setupFirestoreListener()); }); });

        const debts = computed(() => {
            let balances = {}; travelers.value.forEach(t => balances[t] = 0);
            expenses.value.forEach(exp => {
                const amt = Number(exp.amount);
                let benes = exp.type === 'shared' ? (exp.beneficiaries.length > 0 ? exp.beneficiaries : travelers.value) : (exp.beneficiaries.length > 0 ? exp.beneficiaries : [exp.payer]);
                const split = amt / benes.length;
                balances[exp.payer] += amt; benes.forEach(b => balances[b] -= split);
            });
            let res = [], debtors = [], creditors = [];
            for (let p in balances) { if (balances[p] < -1) debtors.push({p, a: balances[p]}); if (balances[p] > 1) creditors.push({p, a: balances[p]}); }
            let i=0, j=0; while(i<debtors.length && j<creditors.length) {
                let amt = Math.min(Math.abs(debtors[i].a), creditors[j].a); res.push({from: debtors[i].p, to: creditors[j].p, amount: Math.round(amt)});
                debtors[i].a += amt; creditors[j].a -= amt; if(Math.abs(debtors[i].a)<1) i++; if(creditors[j].a<1) j++;
            }
            return res;
        });

        const groupedExpenses = computed(() => {
            const groups = {}; filteredExpenses.value.forEach(exp => { const key = exp.date || 'no-date'; if(!groups[key]) groups[key] = []; groups[key].push(exp); });
            return Object.keys(groups).sort((a,b) => b.localeCompare(a)).map(date => ({ date, displayDate: date === 'no-date' ? '未設定' : date, items: groups[date], total: groups[date].reduce((s,i)=>s+Number(i.amount), 0) }));
        });

        // 以下為原始所有導出的變數，缺一不可
        return { 
            currentTab, currentDayIndex, days, currentDayItems, totalExpense, filteredExpenses, notes, sortedNotes, destination, currencySymbol, startDate, exchangeRate, 
            showWizard, tempDestination, tempStartDate, detectedInfo, finishWizard: () => { if(tempDestination.value && tempStartDate.value) { destination.value = tempDestination.value; startDate.value = tempStartDate.value; showWizard.value = false; } }, detectCurrency: () => {},
            showItemModal, showExpenseModal, showSettingsModal, showNoteModal, showTravelerModal, closeAllModals: () => { showItemModal.value = showExpenseModal.value = showNoteModal.value = showSettingsModal.value = showTravelerModal.value = showShoppingEditModal.value = false; },
            getModalTitle: () => "行程細節", formItem, formExpense, formNote, tempHour, tempMinute, travelers,
            saveItem: () => { const newItem = { ...formItem.value, time: `${tempHour.value}:${tempMinute.value}` }; const targetIdx = newItem.dayIndex; delete newItem.dayIndex; delete newItem.originalDayIndex; if(isEditing.value) { days.value[formItem.value.originalDayIndex].items = days.value[formItem.value.originalDayIndex].items.filter(i => i.id !== formItem.value.id); } days.value[targetIdx].items.push(newItem); days.value[targetIdx].items.sort((a,b)=>a.time.localeCompare(b.time)); showItemModal.value = false; },
            saveExpense: () => { formExpense.value.time = `${tempHourExp.value}:${tempMinuteExp.value}`; if(isExpenseEditing.value) { const idx = expenses.value.findIndex(e => e.id === formExpense.value.id); expenses.value.splice(idx, 1, {...formExpense.value}); } else { expenses.value.unshift({...formExpense.value}); } showExpenseModal.value = false; },
            saveNote: () => { if(isNoteEditing.value) { const idx = notes.value.findIndex(n => n.id === formNote.value.id); notes.value.splice(idx, 1, {...formNote.value}); } else { notes.value.unshift({...formNote.value}); } showNoteModal.value = false; },
            editItem: (i) => { formItem.value = {...i, dayIndex: currentDayIndex.value, originalDayIndex: currentDayIndex.value}; [tempHour.value, tempMinute.value] = i.time.split(':'); showItemModal.value = true; isEditing.value=true; },
            editExpense: (e) => { formExpense.value = {...e}; if(e.time) [tempHourExp.value, tempMinuteExp.value] = e.time.split(':'); showExpenseModal.value = true; isExpenseEditing.value=true; },
            editNote: (n) => { formNote.value = {...n}; showNoteModal.value = true; isNoteEditing.value=true; },
            confirmDeleteItem: (id) => { days.value[currentDayIndex.value].items = days.value[currentDayIndex.value].items.filter(i => i.id !== id); },
            confirmDeleteExpense: (id) => { expenses.value = expenses.value.filter(e => e.id !== id); showExpenseModal.value = false; },
            confirmDeleteNote: (id) => { notes.value = notes.value.filter(n => n.id !== id); showNoteModal.value = false; },
            onFabClick: () => { if(currentTab.value==='schedule') { formItem.value={id:Date.now(), time:'09:00', title:'', location:'', note:'', dayIndex:currentDayIndex.value, originalDayIndex:currentDayIndex.value}; showItemModal.value=true; isEditing.value=false; } else if(currentTab.value==='money') { formExpense.value={id:Date.now(), title:'', amount:'', payer:travelers.value[0], beneficiaries:[], type:'shared', date:new Date().toISOString().split('T')[0], time:'09:00'}; showExpenseModal.value=true; isExpenseEditing.value=false; } else { formNote.value={id:Date.now(), title:'', content:'', images:[]}; showNoteModal.value=true; isNoteEditing.value=false; } },
            confirmResetData: () => { startDate.value=''; destination.value=''; showWizard.value=true; },
            addDay: () => days.value.push({items:[]}), confirmDeleteDay: () => days.value.pop(),
            openMap: (l) => window.open(l.startsWith('http')?l:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l)}`, '_blank'),
            searchGoogleMaps: (q) => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, '_blank'),
            renderNote: (n) => n, toast, confirmModal, executeConfirm: () => confirmModal.value.show = false, toTWD, getDayDate,
            toggleExpand: (id) => expandedItemId.value = expandedItemId.value === id ? null : id, expandedItemId, isEditing, isExpenseEditing, isNoteEditing,
            onTouchDragStart: () => {}, onTouchDragMove: () => {}, onTouchDragEnd: () => {}, dragIndex: ref(null), dateContainer: ref(null), onDateDragStart: () => {}, onDateDragMove: () => {}, onDateDragEnd: () => {},
            getMemberDetails: (n) => ({total: (statistics.value.shared/travelers.value.length)+(statistics.value.individual[n]||0), shared: statistics.value.shared/travelers.value.length, private: statistics.value.individual[n]||0}), statistics, debts, toggleBeneficiary: (n) => { if(!formExpense.value.beneficiaries.includes(n)) formExpense.value.beneficiaries.push(n); else formExpense.value.beneficiaries = formExpense.value.beneficiaries.filter(b=>b!==n); }, groupedExpenses, tempHourExp, tempMinuteExp, showMemberStats: ref(true), collapsedDates: ref([]), toggleDateGroup: (d) => { if(collapsedDates.value.includes(d)) collapsedDates.value = collapsedDates.value.filter(x=>x!==d); else collapsedDates.value.push(d); },
            openTravelerModal: () => { editingTravelers.value = [...travelers.value]; showTravelerModal.value = true; }, editingTravelers, addTraveler: () => editingTravelers.value.push('新旅伴'), removeTraveler: (i) => editingTravelers.value.splice(i,1), saveTravelers: () => { travelers.value = [...editingTravelers.value]; showTravelerModal.value = false; },
            isSyncing, permissionError, retryConnection: () => location.reload(), rulesText, copyRules: () => { navigator.clipboard.writeText(rulesText); }, expandedNoteId, toggleExpandNote: (id) => expandedNoteId.value = expandedNoteId.value === id ? null : id,
            onMouseDragStart: () => {}, onMouseDragMove: () => {}, onMouseDragEnd: () => {},
            shoppingList, newShopName, addShop: () => { if(newShopName.value) shoppingList.value.push({id:Date.now(), shopName:newShopName.value, items:[], expanded:true}); newShopName.value=''; },
            removeShop: (id) => { shoppingList.value = shoppingList.value.filter(s => s.id !== id); },
            addItemToShop: (s) => { if(s.tempItemInput) s.items.push({id:Date.now(), text:s.tempItemInput, done:false}); s.tempItemInput=''; },
            removeItem: (sid, iid) => { const s = shoppingList.value.find(x=>x.id===sid); if(s) s.items = s.items.filter(i=>i.id!==iid); },
            toggleItem: (sid, i) => i.done = !i.done, toggleShop: (s) => s.expanded = !s.expanded, enableShopRename: (s) => { s.isRenaming = true; }, saveShopRename: (s) => { s.isRenaming = false; },
            showShoppingEditModal: ref(false), editForm: ref({}), openEditItemModal: (sid, i) => { editForm.value = {shopId: sid, itemId: i.id, text: i.text, note: i.note}; showShoppingEditModal.value = true; }, saveEditItem: () => { const s = shoppingList.value.find(x=>x.id===editForm.value.shopId); const i = s.items.find(x=>x.id===editForm.value.itemId); i.text = editForm.value.text; i.note = editForm.value.note; showShoppingEditModal.value = false; },
            onNoteImageChange: async (e) => { for(let f of e.target.files) formNote.value.images.push(await compressImage(f)); }, onShopItemImageChange: () => {}, onEditItemImageChange: () => {}, viewingImage, viewImage: (s) => viewingImage.value=s, triggerFileInput: (r) => instance.refs[r].click(), exportPDF: () => { window.print(); }
        };
    }
}).mount('#app');
