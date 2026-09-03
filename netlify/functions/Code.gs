/**
 * Shan Computer Systems Billing
 * Netlify Functions backend
 *
 * Required sheets:
 *   Stock: Item ID | Item Name | Cost Price | Selling Price | Stock Qty |
 *          Track Stock | Status | Category
 *   Bills: Bill No | Date & Time | Customer Phone | Items (JSON) | Total |
 *          Cost Total | Profit | Type | Related Bill
 *   Invoices: Invoice No | Date & Time | Customer Name | Customer Phone |
 *             Items (JSON) | Total | Cost Total | Profit
 *   Settings: KEY | VALUE
 *   Payments: Receipt No | Date & Time | Wallet | Service / Biller |
 *             Customer Mobile | Account No | Amount | Service Charge |
 *             Total Amount | Ref No
 */

const APP = Object.freeze({
  SHEETS: Object.freeze({ STOCK: 'Stock', INVOICE_STOCK: 'Invoice Stock', SERIAL_STOCK: 'Serial Stock', BILLS: 'Bills', INVOICES: 'Invoices', SETTINGS: 'Settings', PAYMENTS: 'Payments', PURCHASES: 'Purchases', SUPPLIERS: 'Suppliers', QUOTATIONS: 'Quotations', CUSTOMERS: 'Customers', CREDIT_CUSTOMERS: 'Credit Customers', CREDIT_LEDGER: 'Credit Ledger', CHEQUE_RECEIPTS: 'Cheque Receipts', JOB_NOTES: 'Job Notes', LOANS: 'Interest Loans', LOAN_PAYMENTS: 'Interest Loan Payments', RESTAURANT_MENU: 'Restaurant Menu', ACTIVITY_LOG: 'Activity Log' }),
  DEFAULTS: Object.freeze({
    BUSINESS_NAME: 'SHAN POS SYSTEMS',
    INVOICE_PREFIX: 'SHOP',
    NEXT_BILL_NUMBER: 1,
    NEXT_INVOICE_NUMBER: 1,
    NEXT_PAYMENT_NUMBER: 1,
    NEXT_PURCHASE_NUMBER: 1,
    NEXT_QUOTATION_NUMBER: 1,
    NEXT_JOB_NOTE_NUMBER: 1,
    CURRENCY: 'Rs.',
    DEFAULT_CREDIT_LIMIT: 50000
  })
});

function doGet(e) {
  const currentUrl=RuntimeApp.getService().getUrl(), props=AppProperties.getScriptProperties(), knownUrl=cleanText_(props.getProperty('POS_CANONICAL_WEBAPP_URL'));
  if(false&&knownUrl&&knownUrl!==currentUrl){
    const shop=normaliseShopCode_((e&&e.parameter&&e.parameter.shop)||''), target=knownUrl+(shop?'?shop='+encodeURIComponent(shop):'');
    const safeTarget=JSON.stringify(target).replace(/</g,'\\u003c');
    return AppHtml.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.location.replace('+safeTarget+');</script><p>Opening the latest SHAN POS SYSTEMS version…</p><p><a href="'+target.replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">Open latest version</a></p>').setTitle('SHAN POS SYSTEMS Update');
  }
  props.setProperty('POS_CANONICAL_WEBAPP_URL',currentUrl);
  const template = AppHtml.createTemplateFromFile('CleanIndex');
  template.shopCode = normaliseShopCode_((e && e.parameter && e.parameter.shop) || '');
  template.shopKey = cleanText_((e && e.parameter && e.parameter.key) || '');
  template.supportCode = cleanText_((e && e.parameter && e.parameter.support) || '');
  if (template.shopCode) setActiveShop_(template.shopCode); else setActiveShop_('');
  let initialSettings = {};
  // A clean deployment may not have a Supabase backend yet. Do not touch
  // Supabase PostgreSQL before the first setup card has collected the new Project ID.
  try {
    if (supabaseProjectForShop_(template.shopCode)) initialSettings = publicSettings_(getSettings_(getSpreadsheet_()));
  } catch (setupError) {
    initialSettings = {};
  }
  // Read the protected owner logo directly as well, so it is available on
  // the login screen before authentication and survives a fresh deployment.
  const protectedLogo = globalShanPosManagement_();
  template.softwareLogoUrl = initialSettings.softwareLogoUrl || protectedLogo.SOFTWARE_LOGO_DATA || logoDataUrl_(protectedLogo.SOFTWARE_LOGO_URL || '');
  return template.evaluate()
    .setTitle('SHAN POS SYSTEMS')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function shopActivationKey_() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const part = function () {
    let out = '';
    for (let i = 0; i < 4; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  };
  return [part(), part(), part(), part()].join('-');
}
function normalizeActivationKey_(value) { return cleanText_(value).replace(/\s+/g, '').toUpperCase(); }
function ensureShopActivationKey_(record) {
  if (!record || typeof record !== 'object') return record;
  if (!record.demoMode && !cleanText_(record.activationCode)) record.activationCode = shopActivationKey_();
  if (!record.demoMode && !cleanText_(record.activationCodeExpiresAt)) record.activationCodeExpiresAt = shopLicenseTierExpiresAt_(record.licenseTier || 'FIRST_PURCHASE');
  return record;
}
function shopActivationKeyExpired_(record) {
  const expires = cleanText_(record && record.activationCodeExpiresAt);
  if (!expires) return false;
  const time = new Date(expires).getTime();
  return isFinite(time) && time <= Date.now();
}
function shopActivationKeyMatches_(record, key) {
  const expected = normalizeActivationKey_(record && record.activationCode);
  const actual = normalizeActivationKey_(key);
  return !!expected && !!actual && !shopActivationKeyExpired_(record) && expected === actual;
}
function shopActivationKeyFromInput_(value) {
  const normalized = normalizeActivationKey_(value);
  if (!normalized) return shopActivationKey_();
  if (!/^[A-Z0-9]{16}$/.test(normalized)) throw new Error('Activation key must be 4 parts of 4 characters.');
  return [normalized.slice(0, 4), normalized.slice(4, 8), normalized.slice(8, 12), normalized.slice(12, 16)].join('-');
}
function shopLicenseTierDays_(tier) {
  const key = cleanText_(tier).toUpperCase();
  const map = { FIRST_PURCHASE: 547, NORMAL: 365, VIP: 1825, VIP_PLUS: 3650, VIPS: 9125, SUPER_VIP: 12775, SUPER_VIP_PREMIER: 0 };
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : map.FIRST_PURCHASE;
}
function shopLicenseTierExpiresAt_(tier, baseTime) {
  const key = cleanText_(tier).toUpperCase();
  if (key === 'SUPER_VIP_PREMIER') return '';
  const days = shopLicenseTierDays_(key);
  const from = baseTime ? new Date(baseTime).getTime() : Date.now();
  return new Date(from + days * 86400000).toISOString();
}
function shopLicenseAccessState_(record) {
  const tier = cleanText_(record && record.licenseTier).toUpperCase();
  const demo = !!(record && record.demoMode);
  const unlimited = tier === 'SUPER_VIP_PREMIER';
  const expiresAt = cleanText_(record && (demo ? record.demoExpiresAt : record.activationCodeExpiresAt));
  const remaining = unlimited ? 0 : (expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)) : 0);
  return {
    licenseType: demo ? 'TRIAL' : (tier || 'FIRST_PURCHASE'),
    licenseTier: demo ? 'TRIAL' : (tier || 'FIRST_PURCHASE'),
    licenseTierDays: demo ? Number(record && record.demoTrialDays || 0) : shopLicenseTierDays_(tier || 'FIRST_PURCHASE'),
    licenseExpiresAt: expiresAt,
    licenseDaysRemaining: remaining,
    licenseLocked: !unlimited && remaining <= 0
  };
}

function getInitialData(request) {
  setShopContextFromRequest_(request);
  ensureDailyBackupTrigger_(request&&request.actorPin);
  const ss = getSpreadsheet_();
  const settings = getSettings_(ss);
  const products = getProducts_(ss, APP.SHEETS.STOCK);
  const invoiceProducts = ensureInvoiceStockMatchesNewBill_(ss, products);
  return { settings: publicSettings_(settings), softwareUpdate: softwareUpdateNotice_(), products: products, invoiceProducts: invoiceProducts, restaurantMenu: getRestaurantMenu_(), categories: productCategoryList_(ss, settings), customers: getCustomers_(), paymentWallets: paymentOptionList_(settings, 'PAYMENT_WALLETS', paymentWalletDefaults_()), paymentBanks: paymentOptionList_(settings, 'PAYMENT_BANKS', ['Cash Bank', 'Bank Account']), paymentBankServices: paymentOptionList_(settings, 'PAYMENT_BANK_SERVICES', ['Bank of Ceylon (BOC)', 'People\'s Bank', 'Commercial Bank', 'Sampath Bank', 'Hatton National Bank (HNB)', 'Nations Trust Bank', 'National Development Bank (NDB)', 'National Savings Bank (NSB)', 'Seylan Bank', 'DFCC Bank', 'Pan Asia Bank', 'Amana Bank', 'Union Bank', 'Cargills Bank', 'NDB Investment Bank', 'Standard Chartered Bank', 'HSBC Bank', 'Indian Bank', 'State Bank of India', 'Habib Bank']), paymentFinanceCompanies: paymentOptionList_(settings, 'PAYMENT_FINANCE', ['LOLC Finance', 'LB Finance', 'Vallibel Finance', 'People\'s Leasing & Finance', 'Singer Finance', 'Commercial Leasing & Finance', 'Central Finance', 'HNB Finance', 'Asia Asset Finance', 'Alliance Finance', 'Mercantile Investments and Finance', 'Senkadagala Finance', 'Dialog Finance']), paymentBillers: paymentOptionList_(settings, 'PAYMENT_BILLERS', paymentBillerDefaults_()), paymentBillerMap: paymentBillerMap_(settings), paymentServiceCharges: paymentServiceCharges_(settings), paymentMethods: paymentOptionList_(settings, 'PAYMENT_METHODS', paymentMethodDefaults_()), jobNoteOptions: jobNoteOptions_() };
}

function buildPosBackupPayload_() {
  const ss=getSpreadsheet_(), sheets={};
  Object.keys(APP.SHEETS).forEach(function(key){const name=APP.SHEETS[key],sheet=ss.getSheetByName(name);if(sheet)sheets[name]=sheet.getDataRange().getValues();});
  return {format:'SHAN-POS-BACKUP',version:1,exportedAt:new Date().toISOString(),sheets:sheets};
}
function ensureDailyBackupTrigger_(actorPin) {
  const actor=accountForPin_(actorPin); if(!actor||actor.role!=='OWNER'||activeShopCode_())return;
  const props=AppProperties.getScriptProperties();
  if(props.getProperty('POS_BACKUP_TRIGGERS_READY')==='YES')return;
  const triggers=RuntimeApp.getProjectTriggers();
  if(!triggers.some(function(trigger){return trigger.getHandlerFunction()==='runDailyShopBackups_';}))RuntimeApp.newTrigger('runDailyShopBackups_').timeBased().everyDays(1).atHour(23).inTimezone('Asia/Colombo').create();
  if(!triggers.some(function(trigger){return trigger.getHandlerFunction()==='runMonthlyShopBackups_';}))RuntimeApp.newTrigger('runMonthlyShopBackups_').timeBased().onMonthDay(1).atHour(23).inTimezone('Asia/Colombo').create();
  props.setProperty('POS_BACKUP_TRIGGERS_READY','YES');
}
function runScheduledShopBackups_(kind) {
  const shops=shopDatabaseConfig_(), day=AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd'), stamp=AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyyMMdd-HHmmss'),type=kind==='monthly'?'monthly':'daily';
  Object.keys(shops).filter(function(code){return shopRecordIsActive_(shops[code]);}).forEach(function(shop){
    try{
      setActiveShop_(shop); const payload=buildPosBackupPayload_(), json=JSON.stringify(payload), archive=AppUtilities.zip([AppUtilities.newBlob(json,'application/json','shan-pos-backup.json')],'shan-pos-'+type+'-'+stamp+'.bak');
      shopBackupFolder_().createFile(archive);
      supabaseWriteDocument_(type+'Backups/'+supabaseDocId_(day),{date:day,backupType:type.toUpperCase(),format:'SHAN-POS-BACKUP',exportedAt:payload.exportedAt,backupJson:json},false);
    }catch(error){console.error(type+' backup failed for '+shop+': '+error);}
  });
  setActiveShop_('');
}
function runDailyShopBackups_(){runScheduledShopBackups_('daily');}
function runMonthlyShopBackups_(){runScheduledShopBackups_('monthly');}

/** Creates a portable .bak (ZIP) download of this shop's current POS data. */
function exportPosBackup(request) {
  setShopContextFromRequest_(request);
  const account = accountForPin_(request && request.actorPin);
  if (!account) throw new Error('Please log in again.');
  const payload = buildPosBackupPayload_();
  const stamp = AppUtilities.formatDate(new Date(), AppSession.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  const jsonText = JSON.stringify(payload);
  const requestedFormat = cleanText_(request && request.format).toUpperCase();
  let archive;
  if (requestedFormat === 'JSON') archive = AppUtilities.newBlob(jsonText, 'application/json', 'shan-pos-backup-' + stamp + '.json');
  else if (requestedFormat === 'TXT') archive = AppUtilities.newBlob(jsonText, 'text/plain', 'shan-pos-backup-' + stamp + '.txt');
  else archive = AppUtilities.zip([AppUtilities.newBlob(jsonText, 'application/json', 'shan-pos-backup.json')], 'shan-pos-backup-' + stamp + '.bak');
  let driveUrl = '';
  try {
    const folder = shopBackupFolder_();
    driveUrl = folder.createFile(archive).getUrl();
  } catch (error) {
    console.error('Backup Drive save failed: ' + error);
    if(activeShopCode_()) throw new Error('This Shop has no accessible Supabase Storage backup folder. Add the customer Drive Folder ID and share that folder with the deployed app account.');
  }
  return { fileName:archive.getName(), data:AppUtilities.base64Encode(archive.getBytes()), encoding:'base64', mimeType:archive.getContentType(), driveUrl:driveUrl };
}

function archiveAnyBackupFile(request) {
  setShopContextFromRequest_(request);
  const account=requireBackupUser_(request&&request.actorPin), dataUrl=cleanText_(request&&request.dataUrl), originalName=cleanText_(request&&request.fileName)||'backup-file';
  const match=dataUrl.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!match) throw new Error('Choose a readable backup file.');
  const bytes=AppUtilities.base64Decode(match[2].replace(/\s/g,''));
  if(bytes.length>25*1024*1024) throw new Error('Backup file is too large. Maximum size is 25 MB.');
  const blob=AppUtilities.newBlob(bytes,match[1]||'application/octet-stream',originalName);
  const file=shopBackupFolder_().createFile(blob);
  return {saved:true,fileName:file.getName(),driveUrl:file.getUrl(),size:bytes.length,account:account.name};
}
function shopBackupFolder_(){
  const shop=activeShopCode_();
  if(!shop){const root=StorageApp.getRootFolder(),folders=root.getFoldersByName('SHAN POS Backups'),folder=folders.hasNext()?folders.next():root.createFolder('SHAN POS Backups');return folder;}
  const record=shopRecordForCode_(shop), folderId=cleanText_(record&&record.driveFolderId);
  if(!folderId) throw new Error('Supabase Storage Folder ID has not been configured for this Shop.');
  try{return StorageApp.getFolderById(folderId);}catch(e){throw new Error('The configured Supabase Storage Folder ID is not accessible. Share that folder with the deployed app account.');}
}

/** Every signed-in account may check and restore a portable SHAN POS backup. */
function requireBackupUser_(pin) {
  const account = accountForPin_(pin);
  if (!account) throw new Error('Please log in again.');
  const permissions = account.role === 'OWNER' ? allPermissions_() : account.role === 'SUPER_ADMIN' ? superAdminPermissions_(account) : (account.permissions || {});
  if (permissions.backupImport !== true) throw new Error('Backup Import permission has not been assigned to this account. Ask the Admin or Master Owner.');
  return account;
}
function posBackupParse_(dataUrl) {
  const match=String(dataUrl||'').match(/^data:[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!match) throw new Error('Choose a SHAN POS .bak backup file.');
  const bytes=AppUtilities.base64Decode(match[1].replace(/\s/g,''));
  if(bytes.length>15*1024*1024) throw new Error('Backup is too large. Please use a file under 15 MB.');
  let payload=null,files=[];
  try{files=AppUtilities.unzip(AppUtilities.newBlob(bytes,'application/zip','shan-pos-backup.bak'));}catch(e){files=[];}
  const file=files.filter(function(blob){return blob.getName()==='shan-pos-backup.json';})[0];
  try {
    if(file) payload=JSON.parse(file.getDataAsString('UTF-8'));
    else payload=JSON.parse(AppUtilities.newBlob(bytes,'text/plain','shan-pos-backup.txt').getDataAsString('UTF-8').replace(/^\uFEFF/,''));
  } catch(e) { throw new Error('This is not a readable SHAN POS backup. Use a .bak, .json, or .txt backup downloaded from this software.'); }
  if(!payload||payload.format!=='SHAN-POS-BACKUP'||!payload.sheets||typeof payload.sheets!=='object') throw new Error('The SHAN POS backup file is invalid.');
  const counts={}, valid={}; Object.keys(APP.SHEETS).forEach(function(key){const name=APP.SHEETS[key],rows=payload.sheets[name];if(Array.isArray(rows)){valid[name]=rows;counts[name]=Math.max(0,rows.length-1);}});
  if(!Object.keys(valid).length) throw new Error('No POS data was found in this backup.');
  return {payload:payload,sheets:valid,counts:counts};
}
function inspectPosBackup(request) {
  setShopContextFromRequest_(request);
  requireBackupUser_(request&&request.actorPin);
  const parsed=posBackupParse_(request&&request.dataUrl);
  const preview={};Object.keys(parsed.sheets).forEach(function(name){const rows=parsed.sheets[name]||[];preview[name]={count:Math.max(0,rows.length-1),headers:Array.isArray(rows[0])?rows[0]:[],sample:rows.slice(1,6)};});
  return {exportedAt:cleanText_(parsed.payload.exportedAt),counts:parsed.counts,preview:preview,totalRecords:Object.keys(parsed.counts).reduce(function(sum,key){return sum+parsed.counts[key];},0)};
}
function restoreParsedPosBackup_(parsed) {
  const done={}, physical={}, stockBuffer=[], stockSeen={};
  Object.keys(parsed.sheets).forEach(function(name){
    if (name === APP.SHEETS.STOCK || name === APP.SHEETS.INVOICE_STOCK) {
      const values = parsed.sheets[name] || [];
      const normalised = normaliseStockRows_(values);
      normalised.forEach(function (p) {
        const key = cleanText_(p.id).toUpperCase();
        if (!key) return;
        stockSeen[key] = Object.assign({}, stockSeen[key] || {}, p);
      });
      return;
    }
    const actual=sharedStockSheet_(name); if(physical[actual]) return; physical[actual]=true;
    const rows=parsed.sheets[name], header=Array.isArray(rows[0])?rows[0]:[], body=rows.slice(1).filter(Array.isArray);
    supabaseListRows_(actual).forEach(function(old){supabaseDeleteDocument_(supabaseRowPath_(actual,old.row));});
    supabaseWriteDocument_(supabaseSheetPath_(actual),{headers:header.map(supabaseSafeValue_),nextRow:body.length+2},false);
    const writes=body.map(function(values,index){const row=index+2;return{path:supabaseRowPath_(actual,row),object:{row:row,values:values.map(supabaseSafeValue_)}};});
    if(writes.length) fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(writes);
    done[actual]=body.length;
  });
  const stockActual = sharedStockSheet_(APP.SHEETS.STOCK);
  const stockRows = Object.keys(stockSeen).sort().map(function (id) {
    const p = stockSeen[id] || {};
    return [p.id || id, p.name || '', p.cost || 0, p.price || 0, p.stock || 0, p.trackStock ? 'YES' : 'NO', 'YES', p.category || '', p.warranty || '', p.serial || '', p.barcode || ''];
  });
  if (stockRows.length) {
    supabaseListRows_(stockActual).forEach(function (old) { supabaseDeleteDocument_(supabaseRowPath_(stockActual, old.row)); });
    supabaseWriteDocument_(supabaseSheetPath_(stockActual), { headers: STOCK_HEADERS_.slice(), nextRow: stockRows.length + 2 }, false);
    const writes = stockRows.map(function (values, index) {
      const row = index + 2;
      return { path: supabaseRowPath_(stockActual, row), object: { row: row, values: values.map(supabaseSafeValue_) } };
    });
    if (writes.length) fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(writes);
    done[stockActual] = stockRows.length;
  }
  return {restoredSheets:done,totalRecords:Object.keys(done).reduce(function(sum,key){return sum+done[key];},0)};
}
function restoreUndoPropertyKey_(){return 'SHAN_POS_RESTORE_UNDO_'+(activeShopCode_()||'MASTER');}
function saveRestoreUndoSnapshot_(){
  const json=JSON.stringify(buildPosBackupPayload_());
  const blob=AppUtilities.zip([AppUtilities.newBlob(json,'application/json','shan-pos-backup.json')],'shan-pos-restore-undo.bak');
  const file=shopBackupFolder_().createFile(blob),props=AppProperties.getScriptProperties(),previous=props.getProperty(restoreUndoPropertyKey_());
  if(previous){try{StorageApp.getFileById(previous).setTrashed(true);}catch(e){}}
  props.setProperty(restoreUndoPropertyKey_(),file.getId());
}
function restorePosBackup(request) {
  setShopContextFromRequest_(request);
  requireBackupUser_(request&&request.actorPin);
  const parsed=posBackupParse_(request&&request.dataUrl);
  return withLock_(function(){saveRestoreUndoSnapshot_();return restoreParsedPosBackup_(parsed);});
}
function undoLastPosRestore(request) {
  setShopContextFromRequest_(request);
  const account=requireBackupUser_(request&&request.actorPin);
  if(!['OWNER','SUPER_ADMIN'].includes(account.role)) throw new Error('Only the Master Owner or Super Admin can undo a restore.');
  const props=AppProperties.getScriptProperties(),id=props.getProperty(restoreUndoPropertyKey_());
  if(!id) throw new Error('There is no restore to undo for this account.');
  const file=StorageApp.getFileById(id),parsed=posBackupParse_('data:application/octet-stream;base64,'+AppUtilities.base64Encode(file.getBlob().getBytes()));
  const result=withLock_(function(){return restoreParsedPosBackup_(parsed);});
  try{file.setTrashed(true);}catch(e){}
  props.deleteProperty(restoreUndoPropertyKey_());
  return result;
}
function clearMasterBusinessData(request) {
  const account=accountForPin_(request&&request.actorPin);
  if(!account||account.role!=='OWNER'||activeShopCode_()) throw new Error('Only the Master Owner can clear Master business data.');
  return withLock_(function(){
    let removed=0;
    Object.keys(APP.SHEETS).forEach(function(key){
      const name=APP.SHEETS[key];
      supabaseListRows_(name).forEach(function(row){supabaseDeleteDocument_(supabaseRowPath_(name,row.row));removed++;});
      try{supabaseDeleteDocument_(supabaseSheetPath_(name));}catch(e){}
    });
    AppProperties.getScriptProperties().deleteProperty(restoreUndoPropertyKey_());
    return {cleared:true,removed:removed};
  });
}

/** Copies active New Bill Stock into Invoice Stock, so existing products can be used on invoices and quotations. */
function copyNewBillStockToInvoiceStock(request) {
  requireBackupUser_(request && request.actorPin);
  return withLock_(function () {
    return copyNewBillStockToInvoiceStock_(getSpreadsheet_());
  });
}
function copyNewBillStockToInvoiceStock_(ss) {
    const source = getOrCreateSheet_(ss, APP.SHEETS.STOCK), target = getOrCreateSheet_(ss, APP.SHEETS.INVOICE_STOCK);
    const headers = ['Item ID','Item Name','Cost Price','Selling Price','Stock Qty','Track Stock','Status','Category','Warranty Period','Serial Number','Barcode'];
    ensureHeaders_(source, headers); ensureHeaders_(target, headers);
    const sourceRows = source.getDataRange().getValues().slice(1).filter(function (row) { return cleanText_(row[0]) && cleanText_(row[1]) && String(row[6]).toUpperCase() !== 'NO'; });
    if (!sourceRows.length) throw new Error('No active New Bill Stock items were found.');
    const targetRows = target.getDataRange().getValues(), rowById = {};
    targetRows.slice(1).forEach(function (row, index) { const id = cleanText_(row[0]).toUpperCase(); if (id) rowById[id] = { row:index + 2, values:row.slice() }; });
    const meta = supabaseReadDocument_(supabaseSheetPath_(APP.SHEETS.INVOICE_STOCK)) || { headers:headers, nextRow:2 };
    let nextRow = Math.max(2, Number(meta.nextRow || targetRows.length + 1)), added = 0, updated = 0;
    const writes = [];
    sourceRows.forEach(function (sourceRow) {
      const id = cleanText_(sourceRow[0]).toUpperCase(), current = rowById[id], values = sourceRow.slice();
      while (values.length < headers.length) values.push(''); values[6] = 'YES';
      if (current) { writes.push({ path:supabaseRowPath_(APP.SHEETS.INVOICE_STOCK, current.row), object:{ row:current.row, values:values.map(supabaseSafeValue_) } }); updated++; }
      else { const row = nextRow++; writes.push({ path:supabaseRowPath_(APP.SHEETS.INVOICE_STOCK, row), object:{ row:row, values:values.map(supabaseSafeValue_) } }); added++; }
    });
    meta.nextRow = nextRow; writes.push({ path:supabaseSheetPath_(APP.SHEETS.INVOICE_STOCK), object:meta });
    fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(writes);
    return { added:added, updated:updated, total:added + updated };
}

/** Keep old New Bill items usable in Invoice and Quotation as well.  This only adds/updates
 * matching items; it never deletes an Invoice Stock item. */
function ensureInvoiceStockMatchesNewBill_(ss, saleProducts) {
  const sale = saleProducts || getProducts_(ss, APP.SHEETS.STOCK);
  let invoice = getProducts_(ss, APP.SHEETS.INVOICE_STOCK);
  if (sale.length && sale.some(function (product) { return !invoice.some(function (invoiceProduct) { return invoiceProduct.id === product.id; }); })) {
    copyNewBillStockToInvoiceStock_(ss);
    invoice = getProducts_(ss, APP.SHEETS.INVOICE_STOCK);
  }
  return invoice;
}

/** Saves a reusable product category. Existing product categories are included automatically. */
function saveProductCategory(request) {
  requireAdminPin_(request && request.adminPin);
  const name = cleanText_(request && request.name);
  if (!name) throw new Error('Enter a category name.');
  return withLock_(function () {
    const ss = getSpreadsheet_(), settings = getSettings_(ss);
    const categories = productCategoryList_(ss, settings);
    if (categories.some(function (value) { return value.toUpperCase() === name.toUpperCase(); })) {
      return { name: categories.find(function (value) { return value.toUpperCase() === name.toUpperCase(); }), exists: true };
    }
    categories.push(name);
    categories.sort(function (a, b) { return a.localeCompare(b); });
    setSetting_(ss, 'PRODUCT_CATEGORIES', JSON.stringify(categories));
    return { name: name, exists: false };
  });
}

function jobNoteOptions_() {
  const defaults=defaultJobNoteOptions_(), settings=getSettings_(getSpreadsheet_()), raw=cleanText_(settings.JOB_NOTE_OPTIONS);
  if(!raw)return defaults;
  try {
    const saved=JSON.parse(raw);
    return {issueTypes:Array.isArray(saved.issueTypes)&&saved.issueTypes.length?saved.issueTypes:defaults.issueTypes,devices:Array.isArray(saved.devices)&&saved.devices.length?saved.devices:defaults.devices,statuses:defaults.statuses,warranties:defaults.warranties,services:Array.isArray(saved.services)&&saved.services.length?saved.services:defaults.services,terms:typeof saved.terms==='string'?saved.terms:defaults.terms,receiptNote:typeof saved.receiptNote==='string'?saved.receiptNote:defaults.receiptNote};
  } catch(e) { return defaults; }
}
function saveJobNoteOptions(request) {
  const actor=accountForPin_(request&&request.actorPin);
  if(!actor)throw new Error('Please log in again.');
  const permissions=actor.role==='OWNER'?allPermissions_():actor.role==='SUPER_ADMIN'?superAdminPermissions_(actor):(actor.permissions||{});
  if(permissions.jobNoteSetup!==true)throw new Error('You do not have permission to edit Job Note options. Ask the Master Owner for Job Note Setup permission.');
  const value=request&&request.options;
  if(!value||!Array.isArray(value.issueTypes)||!Array.isArray(value.devices)||!Array.isArray(value.services))throw new Error('Job Note options are invalid.');
  const cleanList=function(items,label){const out=[];items.forEach(function(item){const name=cleanText_(item);if(name&&!out.some(function(x){return x.toLowerCase()===name.toLowerCase();}))out.push(name);});if(!out.length)throw new Error('Add at least one '+label+'.');return out;};
  const issueTypes=cleanList(value.issueTypes,'issue type'),devices=cleanList(value.devices,'device'),services=[];
  value.services.forEach(function(item){const name=cleanText_(item&&item.name),serviceDevices=Array.isArray(item&&item.devices)?cleanList(item.devices,'service device'):[],issues=Array.isArray(item&&item.issues)?cleanList(item.issues,'service issue'):[];if(name&&serviceDevices.length&&issues.length)services.push({name:name,devices:serviceDevices,issues:issues});});
  if(!services.length)throw new Error('Add at least one service with devices and issue types.');
  const saved={issueTypes:issueTypes,devices:devices,services:services,terms:cleanText_(value.terms),receiptNote:cleanText_(value.receiptNote)};setSetting_(getSpreadsheet_(),'JOB_NOTE_OPTIONS',JSON.stringify(saved));return jobNoteOptions_();
}
function defaultJobNoteOptions_() {
  return {
    terms: '',
    receiptNote: '',
    issueTypes: ['Hardware', 'Software', 'Network', 'Virus/Malware', 'Data Recovery', 'Maintenance', 'Other'],
    devices: ['Desktop PC', 'Laptop', 'Printer', 'Server', 'Router', 'Mobile', 'Tablet', 'Other'],
    statuses: ['Pending', 'In Progress', 'On Hold', 'Completed', 'Delivered'],
    warranties: ['Warranty Available', 'No Warranty'],
    services: [
      {name:'Desktop Diagnostics',devices:['Desktop PC'],issues:['Hardware','Software','Maintenance']},
      {name:'Desktop Repair',devices:['Desktop PC'],issues:['Hardware']},
      {name:'Windows / OS Installation',devices:['Desktop PC','Laptop','Server'],issues:['Software']},
      {name:'Software Installation',devices:['Desktop PC','Laptop'],issues:['Software']},
      {name:'Driver Installation',devices:['Desktop PC','Laptop','Printer'],issues:['Software']},
      {name:'Virus / Malware Removal',devices:['Desktop PC','Laptop','Mobile','Tablet'],issues:['Virus/Malware']},
      {name:'Data Backup',devices:['Desktop PC','Laptop','Server','Mobile','Tablet'],issues:['Data Recovery','Maintenance']},
      {name:'Data Recovery',devices:['Desktop PC','Laptop','Server','Mobile','Tablet'],issues:['Data Recovery']},
      {name:'RAM / SSD Upgrade',devices:['Desktop PC','Laptop'],issues:['Hardware']},
      {name:'Cleaning / Service',devices:['Desktop PC','Laptop','Printer','Server'],issues:['Maintenance']},
      {name:'Laptop Diagnostics',devices:['Laptop'],issues:['Hardware','Software','Maintenance']},
      {name:'Laptop Repair',devices:['Laptop'],issues:['Hardware']},
      {name:'Laptop Display Replacement',devices:['Laptop'],issues:['Hardware']},
      {name:'Laptop Keyboard Replacement',devices:['Laptop'],issues:['Hardware']},
      {name:'Laptop Battery / Adapter Check',devices:['Laptop'],issues:['Hardware']},
      {name:'Laptop Hinges / Body Repair',devices:['Laptop'],issues:['Hardware']},
      {name:'Printer Diagnostics',devices:['Printer'],issues:['Hardware','Software','Maintenance']},
      {name:'Printer Repair',devices:['Printer'],issues:['Hardware']},
      {name:'Cartridge / Toner Service',devices:['Printer'],issues:['Maintenance']},
      {name:'Paper Jam Service',devices:['Printer'],issues:['Hardware','Maintenance']},
      {name:'Network Printer Setup',devices:['Printer'],issues:['Network','Software']},
      {name:'Server Diagnostics',devices:['Server'],issues:['Hardware','Software','Network','Maintenance']},
      {name:'Server Repair',devices:['Server'],issues:['Hardware']},
      {name:'RAID / Storage Check',devices:['Server'],issues:['Hardware','Data Recovery']},
      {name:'Backup Setup',devices:['Server','Desktop PC','Laptop'],issues:['Maintenance','Data Recovery']},
      {name:'Network Setup',devices:['Server','Router','Desktop PC','Laptop','Printer'],issues:['Network']},
      {name:'Router Setup',devices:['Router'],issues:['Network']},
      {name:'WiFi Configuration',devices:['Router'],issues:['Network']},
      {name:'Router Password Change',devices:['Router'],issues:['Network','Maintenance']},
      {name:'Firmware Update',devices:['Router','Printer'],issues:['Software','Maintenance']},
      {name:'Mobile Software Service',devices:['Mobile','Tablet'],issues:['Software']},
      {name:'Mobile Screen / Charging / Battery Check',devices:['Mobile','Tablet'],issues:['Hardware']},
      {name:'Consultation',devices:['Desktop PC','Laptop','Printer','Server','Router','Mobile','Tablet','Other'],issues:['Hardware','Software','Network','Virus/Malware','Data Recovery','Maintenance','Other']},
      {name:'General Diagnostics',devices:['Other'],issues:['Other']},
      {name:'General Repair',devices:['Other'],issues:['Other']}
    ]
  };
}

function jobNoteServicesFor_(device, issueType) {
  const d = cleanText_(device), i = cleanText_(issueType), options = jobNoteOptions_();
  return options.services.filter(function (service) {
    return service.devices.indexOf(d) >= 0 && (!i || service.issues.indexOf(i) >= 0);
  }).map(function (service) { return service.name; });
}

function nextJobNoteNo_(settings) {
  const prefix = cleanText_(settings && settings.INVOICE_PREFIX) || APP.DEFAULTS.INVOICE_PREFIX;
  const next = Math.max(1, Number((settings && settings.NEXT_JOB_NOTE_NUMBER) || APP.DEFAULTS.NEXT_JOB_NOTE_NUMBER));
  return prefix.replace(/[-\s]+$/g, '') + '-' + String(next).padStart(4, '0');
}

function getJobNoteDraftInfo(request) {
  requirePermission_(request && request.actorPin, 'jobNotes');
  const settings = getSettings_(getSpreadsheet_());
  return { jobNo: nextJobNoteNo_(settings), date: new Date().toISOString(), options: jobNoteOptions_() };
}

function saveJobNote(request) {
  const actor = requirePermission_(request && request.actorPin, 'jobNotes');
  const customerName = cleanText_(request && request.customerName), phone = cleanText_(request && request.phone);
  const issueType = cleanText_(request && request.issueType), device = cleanText_(request && request.device), service = cleanText_(request && request.service);
  const brandModel = cleanText_(request && request.brandModel), serialNumber = cleanText_(request && request.serialNumber);
  const status = cleanText_(request && request.status) || 'Pending', warranty = cleanText_(request && request.warranty) || 'Warranty Available';
  const problemDescription = cleanText_(request && request.problemDescription);
  const options = jobNoteOptions_();
  if (!customerName) throw new Error('Enter customer name.');
  if (!phone) throw new Error('Enter phone number.');
  if (options.issueTypes.indexOf(issueType) < 0) throw new Error('Select a valid issue type.');
  if (options.devices.indexOf(device) < 0) throw new Error('Select a valid device.');
  if (jobNoteServicesFor_(device, issueType).indexOf(service) < 0) throw new Error('Select a service that matches the selected device and issue type.');
  if (options.statuses.indexOf(status) < 0) throw new Error('Select a valid status.');
  if (options.warranties.indexOf(warranty) < 0) throw new Error('Select a valid warranty option.');
  return withLock_(function () {
    const ss = getSpreadsheet_(), settings = getSettings_(ss), sheet = getOrCreateSheet_(ss, APP.SHEETS.JOB_NOTES);
    const headers = ['Job No','Date & Time','Customer Name','Phone','Issue Type','Device','Brand / Model','Serial Number','Service','Status','Warranty','Problem Description','Created By','Shop Code'];
    ensureHeaders_(sheet, headers);
    const next = Math.max(1, Number(settings.NEXT_JOB_NOTE_NUMBER || APP.DEFAULTS.NEXT_JOB_NOTE_NUMBER));
    const jobNo = nextJobNoteNo_(settings), now = new Date();
    sheet.appendRow([jobNo, now, customerName, phone, issueType, device, brandModel, serialNumber, service, status, warranty, problemDescription, actor.name, activeShopCode_() || 'MASTER']);
    setSetting_(ss, 'NEXT_JOB_NOTE_NUMBER', next + 1);
    const jobOptions=jobNoteOptions_();
    return { jobNo:jobNo, date:now.toISOString(), customerName:customerName, phone:phone, issueType:issueType, device:device, brandModel:brandModel, serialNumber:serialNumber, service:service, status:status, warranty:warranty, problemDescription:problemDescription, createdBy:actor.name, jobNoteTerms:jobOptions.terms||'', jobNoteReceiptNote:jobOptions.receiptNote||'', settings:publicSettings_(settings) };
  });
}

/** First-run database setup. One master deployment uses a shared master Supabase backend for all shops. */
function getDatabaseSetupStatus(shopCode) {
  const shop = normaliseShopCode_(shopCode && typeof shopCode === 'object' ? shopCode.shopCode : shopCode);
  if (shop) {
    const record = shopRecordForCode_(shop);
    if (!shopRecordIsActive_(record)) {
      setActiveShop_('');
      return { configured:false, projectId:'', shopCode:shop, multiShop:true, accessBlocked:true, deleted:true, message:'This shop link has been deleted or disabled.' };
    }
    setActiveShop_(shop);
    const projectId = masterSupabaseProjectId_();
    return { configured:!!projectId, projectId:projectId, shopCode:shop, shopName:cleanText_(record.shopName)||shop, multiShop:true, accessBlocked:false };
  }
  setActiveShop_('');
  const projectId = masterSupabaseProjectId_();
  return { configured:!!projectId, projectId:projectId, shopCode:'DEFAULT', multiShop:true, accessBlocked:false };
}
function configureDatabaseFromUi(request) {
  const pin = cleanText_(request && (request.activationPin || request.superAdminPin));
  const projectId = cleanText_(request && request.projectId);
  const driveFolderId = cleanDriveFolderId_(request && request.driveFolderId);
  const shop = normaliseShopCode_(request && request.shopCode);
  if (shop) {
    return withLock_(function () {
      const shops = shopDatabaseConfig_(), record = shops[shop];
      if (!shopRecordIsActive_(record)) throw new Error('This shop link has been deleted or disabled.');
       if (driveFolderId) record.driveFolderId = driveFolderId;
      const pinOk = (record.initialPinHash && record.initialPinHash === pinHash_(pin)) || cleanText_(record.activationCode) === pin;
      if (!pinOk) throw new Error('Activation / First Login PIN is incorrect.');
      setActiveShop_(shop);
      const masterProjectId = masterSupabaseProjectId_();
      if (!masterProjectId) throw new Error('Master Supabase backend is not configured. Open the Master Account and connect the shared backend first.');
      const config = posAccessConfig_();
      const primary = (config.accounts || []).find(function (account) { return !account.parentId; }) || config.accounts[0];
      if (primary) {
        const configuredPermissions = record.adminPermissions && typeof record.adminPermissions === 'object' ? permissionsForConfiguredShop_(record.adminPermissions) : null;
        primary.masterLocked = true;
        primary.role = cleanText_(record.initialRole).toUpperCase() || primary.role || 'SUPER_ADMIN';
        primary.name = cleanText_(record.initialUsername) || cleanText_(primary.name) || cleanText_(record.initialRole).replace('_', ' ') || 'Shop Admin';
        primary.pinHash = record.initialPinHash || primary.pinHash;
        if (configuredPermissions) primary.permissions = configuredPermissions;
        if (primary.role === 'SYSTEM_ADMIN' || primary.role === 'SUPER_ADMIN') primary.permissions.manageAccounts = true;
        primary.demoExpiresAt = record.demoMode ? cleanText_(record.demoExpiresAt) : '';
        saveAccessConfig_(config);
      }
      record.firstOpenedAt = record.firstOpenedAt || new Date().toISOString();
      record.lastActiveAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      saveShopDatabaseConfig_(shops);
      return { configured:true, projectId:masterProjectId, shopCode:shop, shopName:cleanText_(record.shopName)||shop, activated:true };
    });
  }
  setActiveShop_('');
  const account = accountForPin_(pin);
  if (!account || !isTopRole_(account.role)) throw new Error('Enter a valid Master account PIN.');
  const masterProjectId = masterSupabaseProjectId_();
  
  if (projectId) AppProperties.getScriptProperties().setProperty('SUPABASE_URL',projectId);
  return { configured:true, projectId:projectId||masterProjectId, shopCode:'DEFAULT' };
}
function createShopLinkFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin);
  if(!actor || actor.role!=='OWNER' || activeShopCode_()) throw new Error('Only the Master Owner on the Master page can create a shop link.');
  const name=cleanText_(request&&request.shopName);
  // If the protected code field is left blank, derive a unique protected
  // code from the shop name so account creation is not blocked unnecessarily.
  let softwareCode=normaliseShopCode_(request&&request.softwareCode);
  if(!softwareCode) softwareCode=normaliseShopCode_(name);
  if(!name) throw new Error('Enter the shop name.');
  
  
  let adminPermissions=permissionsForConfiguredShop_(request&&request.adminPermissions||{});const requestedRole=cleanText_(request&&request.accountRole).toUpperCase(),accountRole=['SYSTEM_ADMIN','SUPER_ADMIN','ADMIN','SUPERVISOR','MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT'].includes(requestedRole)?requestedRole:'SUPER_ADMIN',initialPin=cleanText_(request&&request.initialPin)||'1111',initialUsername=cleanText_(request&&request.initialUsername)||'admin',demoMode=adminPermissions.demoMode===true,demoTrialDays=demoMode?Math.min(15,Math.max(7,Math.floor(Number(request&&request.demoTrialDays||7)))):0,licenseTier=cleanText_(request&&request.licenseTier).toUpperCase()||'FIRST_PURCHASE';
  if(!/^\d{4,6}$/.test(initialPin))throw new Error('Initial PIN must be 4 to 6 digits.');
  if(demoMode&&!isFinite(demoTrialDays))throw new Error('Enter valid Demo trial days.');
  return withLock_(function(){const shops=shopDatabaseConfig_();if(Object.keys(shops).some(function(key){return normaliseShopCode_(shops[key]&&shops[key].softwareCode)===softwareCode;}))throw new Error('This Software Code is already assigned to another customer.');const root=normaliseShopCode_(name)||'SHOP';let code=root,n=2;while(shops[code])code=root.slice(0,Math.max(1,36-String(n).length))+'-'+n++;const customerDetails=request&&request.customerDetails&&typeof request.customerDetails==='object'?{firstBranchName:cleanText_(request.customerDetails.firstBranchName),ownerName:cleanText_(request.customerDetails.ownerName),ownerPhone:cleanText_(request.customerDetails.ownerPhone),ownerEmail:cleanText_(request.customerDetails.ownerEmail),businessType:cleanText_(request.customerDetails.businessType),businessAddress:cleanText_(request.customerDetails.businessAddress)}:{};if(branchReadAllowedForBusinessMode_(customerDetails.businessType))adminPermissions.branchView=true;const allowedRoles=normaliseAllowedShopRoles_(request&&request.allowedRoles,customerDetails.businessType);if(allowedRoles.indexOf(accountRole)<0)allowedRoles.unshift(accountRole);const activationCode=demoMode?'':shopActivationKeyFromInput_(request&&request.activationCode),activationCodeExpiresAt=demoMode?'':shopLicenseTierExpiresAt_(licenseTier);shops[code]=ensureShopActivationKey_({shopName:name,softwareCode:softwareCode,activationCode:activationCode,activationCodeExpiresAt:activationCodeExpiresAt,licenseTier:licenseTier||'FIRST_PURCHASE',customerDetails:customerDetails,initialRole:accountRole,initialUsername:initialUsername,allowedRoles:allowedRoles,initialPinHash:pinHash_(initialPin),adminPermissions:adminPermissions,demoMode:demoMode,demoTrialDays:demoTrialDays,demoExpiresAt:demoMode?new Date(Date.now()+demoTrialDays*86400000).toISOString():'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),active:true,status:'ACTIVE'});saveShopDatabaseConfig_(shops);const serviceUrl=RuntimeApp.getService().getUrl();return{shopCode:code,softwareCode:softwareCode,activationCode:activationCode,activationCodeExpiresAt:activationCodeExpiresAt,licenseTier:licenseTier||'FIRST_PURCHASE',shopName:name,shopUrl:serviceUrl+'?shop='+encodeURIComponent(code),initialAccountName:initialUsername,initialUsername:initialUsername,initialPin:initialPin,allowedRoles:allowedRoles,demoMode:demoMode,demoTrialDays:demoTrialDays,demoExpiresAt:shops[code].demoExpiresAt};});
}
/* Allow the same display name or requested code to be used again while keeping
   every customer software record and link unique. */
const __shanCreateShopLinkOriginal = createShopLinkFromMaster;
createShopLinkFromMaster = function(request) {
  const copy = Object.assign({}, request || {}), base = normaliseShopCode_(copy.softwareCode), requestedName = normaliseShopCode_(copy.shopName);
  const rows = getMasterShopDashboard(copy.actorPin).shops || [];
  const localRegistry = shopDatabaseConfig_();
  const sameName=rows.filter(function(row){return row&&row.deleted!==true&&normaliseShopCode_(row.shopName)===requestedName;});
  const usableSameName=sameName.some(function(row){const access=AppProperties.getScriptProperties().getProperty('POS_ACCESS_CONFIG_SHOP_'+row.shopCode);return row.enabled!==false&&String(row.activationStatus||'').toUpperCase()!=='INACTIVE'&&!!access;});
  if (usableSameName) throw new Error('This shop/company already has a working account. Open that account from Master Dashboard; a second working account with the same name is not allowed.');
  let candidate = base, suffix = 2;
  while (rows.some(function(row) { return normaliseShopCode_(row.softwareCode) === candidate; }) || Object.keys(localRegistry).some(function(key) {
    return normaliseShopCode_(localRegistry[key] && localRegistry[key].softwareCode) === candidate;
  })) {
    candidate = base.slice(0, Math.max(1, 36 - String(suffix).length - 1)) + '-' + suffix++;
  }
  copy.softwareCode = candidate;
  const result = __shanCreateShopLinkOriginal(copy);
  result.requestedSoftwareCode = base;
  result.softwareCode = candidate;
  result.uniqueCodeNotice = candidate === base ? '' : 'The requested Software Code already existed, so a unique code was assigned: ' + candidate;
  return result;
};

// Customer package prices are controlled by the Master and are visible to the
// customer even while the account is still in Demo/Trial mode. Demo never
// receives an activation key until the Master confirms payment.
function setCustomerLicensePriceFromMaster(request) {
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),tier=cleanText_(request&&request.licenseTier).toUpperCase(),price=Number(request&&request.price);
  const valid=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'];
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can save customer package prices.');
  if(!shop||!valid.includes(tier)||!isFinite(price)||price<0)throw new Error('Select a package and enter a valid price.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Customer shop not found.');record.licenseOffers=record.licenseOffers||{};record.licenseOffers[tier]=Math.round(price*100)/100;record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,licenseTier:tier,price:record.licenseOffers[tier],offers:record.licenseOffers};});
}
function setGlobalCustomerLicensePriceFromMaster(request){
  const actor=accountForPin_(request&&request.actorPin),tier=cleanText_(request&&request.licenseTier).toUpperCase(),price=Number(request&&request.price),valid=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'];
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can save customer package prices.');
  if(!valid.includes(tier)||!isFinite(price)||price<0)throw new Error('Select a package and enter a valid price.');
  return withLock_(function(){const key='SHAN_GLOBAL_LICENSE_OFFERS',offers=JSON.parse(AppProperties.getScriptProperties().getProperty(key)||'{}');offers[tier]=Math.round(price*100)/100;AppProperties.getScriptProperties().setProperty(key,JSON.stringify(offers));return{licenseTier:tier,price:offers[tier],offers:offers};});
}
function deleteGlobalCustomerLicensePriceFromMaster(request){
  const actor=accountForPin_(request&&request.actorPin),tier=cleanText_(request&&request.licenseTier).toUpperCase();
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can delete customer package prices.');
  const valid=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'];if(!valid.includes(tier))throw new Error('Select a valid package.');
  return withLock_(function(){const key='SHAN_GLOBAL_LICENSE_OFFERS',offers=JSON.parse(AppProperties.getScriptProperties().getProperty(key)||'{}');delete offers[tier];AppProperties.getScriptProperties().setProperty(key,JSON.stringify(offers));return{licenseTier:tier,deleted:true,offers:offers};});
}
function getGlobalCustomerLicensePrices(request){
  const actor=accountForPin_(request&&request.actorPin);if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can view customer package prices.');
  const names={FIRST_PURCHASE:'First Purchase - 18 months',NORMAL:'Normal - 365 days',VIP:'VIP - 5 years',VIP_PLUS:'VIP Plus - 10 years',VIPS:'VIPS - 25 years',SUPER_VIP:'Super VIP - 35 years',SUPER_VIP_PREMIER:'Super VIP Premier - Unlimited'},order=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'],offers=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_GLOBAL_LICENSE_OFFERS')||'{}');
  return{rows:order.map(function(tier){return{licenseTier:tier,name:names[tier],price:offers[tier]===undefined?'':offers[tier]};})};
}
function getCustomerLicenseOffers(request){
  setShopContextFromRequest_(request||{});const shop=activeShopCode_(),record=shop?shopRecordForCode_(shop):null;if(!record)throw new Error('Customer software not found.');
  const tiers=[['FIRST_PURCHASE','First Purchase'],['NORMAL','Normal'],['VIP','VIP'],['VIP_PLUS','VIP Plus'],['VIPS','VIPS'],['SUPER_VIP','Super VIP'],['SUPER_VIP_PREMIER','Super VIP Premier']],globalOffers=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_GLOBAL_LICENSE_OFFERS')||'{}'),offers=Object.assign({},globalOffers,record.licenseOffers||{});
  return tiers.map(function(x){return{licenseTier:x[0],name:x[1],days:shopLicenseTierDays_(x[0]),price:offers[x[0]]===undefined?'':offers[x[0]]};});
}
function requestCustomerLicensePurchase(request){
  setShopContextFromRequest_(request||{});const shop=activeShopCode_(),actor=accountForPin_(request&&request.actorPin),tier=cleanText_(request&&request.licenseTier).toUpperCase();
  if(!shop||!actor)throw new Error('This request is available only from a customer software link.');
  const record=shopRecordForCode_(shop),valid=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'];if(!record)throw new Error('Customer software not found.');if(!valid.includes(tier))throw new Error('Select a valid package.');
  const key='SHAN_LICENSE_PURCHASE_REQUESTS',rows=JSON.parse(AppProperties.getScriptProperties().getProperty(key)||'[]'),item={id:'LIC-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),shopCode:shop,shopName:record.shopName||shop,requestedBy:actor.name,licenseTier:tier,createdAt:new Date().toISOString(),status:'PENDING_PAYMENT'};rows.push(item);AppProperties.getScriptProperties().setProperty(key,JSON.stringify(rows));return{status:item.status,id:item.id};
}
function submitCustomerLicensePaymentProof(request){
  setShopContextFromRequest_(request||{});const shop=activeShopCode_(),actor=accountForPin_(request&&request.actorPin),tier=cleanText_(request&&request.licenseTier).toUpperCase(),amount=Number(request&&request.amount),slip=cleanText_(request&&request.slipDataUrl);
  const record=shop?shopRecordForCode_(shop):null;if(!shop||!actor||!record)throw new Error('This payment form is available only from a customer software link.');if(!isFinite(amount)||amount<=0||!slip||slip.length>12000000)throw new Error('Enter the amount and upload the bank payment slip.');
  const key='SHAN_LICENSE_PAYMENT_PROOFS',rows=JSON.parse(AppProperties.getScriptProperties().getProperty(key)||'[]'),item={id:'PAY-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),shopCode:shop,shopName:record.shopName||shop,requestedBy:actor.name,licenseTier:tier,amount:amount,slipDataUrl:slip,createdAt:new Date().toISOString(),status:'PENDING_REVIEW'};rows.push(item);AppProperties.getScriptProperties().setProperty(key,JSON.stringify(rows));return{id:item.id,status:item.status};
}

// Master-only support accounts receive their own secure link and workspace.
const __shanOriginalCreateMasterSupportMember=createMasterSupportMember;
function createMasterSupportMember(request){
  const actor=accountForPin_(request&&request.actorPin),name=cleanText_(request&&request.name),role=cleanText_(request&&request.role).toUpperCase(),pin=cleanText_(request&&request.pin);
  const roles={SENIOR_SUPPORT:{label:'Senior Support',authority:'90%'},SUPPORT_MANAGER:{label:'Support Manager',authority:'65-70%'},SUPPORT_OPERATOR:{label:'Support Operator',authority:'65-70%'},SUPPORT_ASSISTANT:{label:'Support Assistant',authority:'50-65%'},SUPPORT_AGENT:{label:'Support Agent',authority:'Lower support scope'}};
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can create support members.');
  if(!name||!roles[role]||!/^[0-9]{4,6}$/.test(pin))throw new Error('Enter a name, valid support role, and a 4 to 6 digit PIN.');
  return withLock_(function(){
    const config=posAccessConfig_(),active=(config.accounts||[]).filter(function(a){return a.supportCode&&a.active!==false;});
    
    if(config.accounts.some(function(a){return a.active!==false&&a.pinHash===pinHash_(pin)}))throw new Error('Choose a PIN not used by another account.');
    const code='SUP-'+AppUtilities.getUuid().replace(/-/g,'').slice(0,12).toUpperCase(),permissions={customerSupport:role!=='SUPPORT_AGENT',reportsView:role==='SENIOR_SUPPORT'||role==='SUPPORT_MANAGER',workAssignment:role==='SENIOR_SUPPORT'||role==='SUPPORT_MANAGER',deploymentAssist:role==='SENIOR_SUPPORT',permissionApproval:role==='SENIOR_SUPPORT'};
    const account={id:'support-'+AppUtilities.getUuid(),name:name,role:'SUPPORT',supportRole:role,supportAuthority:roles[role].authority,supportCode:code,pinHash:pinHash_(pin),parentId:actor.id,active:true,permissions:permissions};
    config.accounts.push(account);saveAccessConfig_(config);
    const serviceUrl=RuntimeApp.getService().getUrl();
    return{id:account.id,name:name,role:role,authority:roles[role].authority,supportUsername:name,supportPin:pin,supportCode:code,link:serviceUrl+'?support='+encodeURIComponent(code)};
  });
}

/* Application-aware stock visibility. Quotation and Stock Lookup see all shared stock. */
const __shanStockLookupBase=getStockLookupProducts;
function __shanStockGroup_(product){
  const c=String(product&&product.category||'').toLowerCase();
  if(c.indexOf('mobile')>=0||c.indexOf('repair')>=0)return'MOBILE';
  if(c.indexOf('restaurant')>=0||c.indexOf('hotel')>=0||c.indexOf('food')>=0)return'RESTAURANT';
  if(c.indexOf('invoice')>=0)return'INVOICE';
  if(c.indexOf('new bill')>=0||c.indexOf('sale')>=0)return'SALE';
  return'GENERAL';
}
getStockLookupProducts=function(request){
  const rows=__shanStockLookupBase(request||{}),view=String(request&&request.stockView||'ALL').toUpperCase();
  if(view==='ALL')return rows;
  return rows.filter(function(p){const g=__shanStockGroup_(p);if(view==='SALE')return g==='SALE'||g==='GENERAL';if(view==='INVOICE')return g==='SALE'||g==='INVOICE'||g==='GENERAL';if(view==='MOBILE')return g==='MOBILE'||g==='GENERAL';if(view==='RESTAURANT')return g==='RESTAURANT'||g==='GENERAL';return true;});
};
function getMasterControlStatus(actorPin) {
  setActiveShop_('');
  const actor=accountForPin_(actorPin);
  return { allowed:!!(actor && actor.role==='OWNER' && !activeShopCode_()) };
}
function deleteShopLinkFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode);
  if(!actor || actor.role!=='OWNER' || activeShopCode_()) throw new Error('Only the Master Owner on the Master page can delete a shop link.');
  if(!shop) throw new Error('Select a shop link to delete.');
  return withLock_(function(){
    const shops=shopDatabaseConfig_(),record=shops[shop];
    if(record) delete shops[shop];
    saveShopDatabaseConfig_(shops);
    purgeDeletedShopScopedState_(shop);
    return{shopCode:shop,shopName:cleanText_(record&&record.shopName)||shop,deleted:true};
  });
}
function setShopLinkActiveFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),active=request&&request.active===true;
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can change a customer shop status.');
  if(!shop)throw new Error('Select a customer shop.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Customer shop not found.');record.active=active;record.status=active?'ACTIVE':'INACTIVE';record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,active:active,status:record.status};});
}
/** Keeps a shop's records intact while the Software Owner temporarily stops
 * or restores customer access, for example when a subscription is unpaid. */
function setShopLinkSuspendedFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),suspended=request&&request.suspended===true;
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can change a customer shop access status.');
  if(!shop)throw new Error('Select a shop link.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Shop link not found.');record.active=!suspended;record.status=suspended?'SUSPENDED':'ACTIVE';record.suspendedAt=suspended?new Date().toISOString():'';record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,shopName:cleanText_(record.shopName)||shop,suspended:suspended};});
}
/** Software Owner selects which features the primary Super Admin gets. */
function updateShopPermissionsFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can change customer shop permissions.');
  if(!shop)throw new Error('Select a shop link.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Shop link not found.');const permissions=permissionsForConfiguredShop_(request&&request.permissions||{});if(branchReadAllowedForBusinessMode_((record.customerDetails||{}).businessType))permissions.branchView=true;const allowedRoles=normaliseAllowedShopRoles_(request&&request.allowedRoles,(record.customerDetails||{}).businessType);record.adminPermissions=permissions;record.allowedRoles=allowedRoles;record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);const key='POS_ACCESS_CONFIG_SHOP_'+shop,raw=AppProperties.getScriptProperties().getProperty(key);if(raw){const config=JSON.parse(raw),primary=(config.accounts||[]).find(function(account){return !account.parentId;})||(config.accounts||[])[0];if(primary){primary.permissions=permissions;cascadePermissionsToChildren_(config,primary.id,permissions);AppProperties.getScriptProperties().setProperty(key,JSON.stringify(config));}}return{shopCode:shop,permissions:permissions,allowedRoles:allowedRoles};});
}
function updateCustomerFirstLoginFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),username=cleanText_(request&&request.username),pin=cleanText_(request&&request.pin);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can change a customer first login.');
  if(!shop)throw new Error('Select the customer shop.');
  if(!username)throw new Error('Enter username.');
  if(!/^\d{4,6}$/.test(pin))throw new Error('PIN must be 4 to 6 digits.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Shop link not found.');record.initialUsername=username;record.initialPinHash=pinHash_(pin);record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);const key='POS_ACCESS_CONFIG_SHOP_'+shop,raw=AppProperties.getScriptProperties().getProperty(key);if(raw){const config=JSON.parse(raw),primary=(config.accounts||[]).find(function(account){return !account.parentId;})||(config.accounts||[])[0];if(primary){primary.name=username;primary.pinHash=pinHash_(pin);primary.masterLocked=true;AppProperties.getScriptProperties().setProperty(key,JSON.stringify(config));}}return{shopCode:shop,username:username,pinChanged:true};});
}
function updateShopActivationKeyFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),key=shopActivationKeyFromInput_(request&&request.activationCode);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can change a customer activation key.');
  if(!shop||!key)throw new Error('Select a customer shop and enter a valid activation key.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Customer shop not found.');const duplicate=Object.keys(shops).some(function(code){return code!==shop&&normaliseActivationKey_(shops[code]&&shops[code].activationCode)===normaliseActivationKey_(key);});if(duplicate)throw new Error('This activation key is already assigned to another customer shop.');record.demoMode=false;record.demoTrialDays=0;record.demoExpiresAt='';record.licenseTier='FIRST_PURCHASE';record.activationCode=key;record.activationCodeExpiresAt=shopLicenseTierExpiresAt_('FIRST_PURCHASE');record.active=true;record.status='ACTIVE';record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,activationCode:key,activationCodeExpiresAt:record.activationCodeExpiresAt,status:record.status,converted:true};});
}
function customerBranchActor_(request){
  setShopContextFromRequest_(request||{});
  const shop=activeShopCode_(),actor=accountForPin_(request&&request.actorPin),record=shop?shopRecordForCode_(shop):null;
  if(!shop||!record)throw new Error('Branch management is available only from a customer company shop link.');
  const mode=cleanText_((record.customerDetails||{}).businessType).toUpperCase(),permissions=actor&&(actor.permissions||{});
  if(!actor||!(isTopRole_(actor.role)||permissions.branchView===true||permissions.manageAccounts===true))throw new Error('You do not have permission to manage company branches.');
  if(!branchReadAllowedForBusinessMode_(mode))throw new Error('This business type is configured as a single shop.');
  return {shop:shop,actor:actor,record:record};
}
function customerBranchesPropertyKey_(){const shop=activeShopCode_();return shop?'POS_CUSTOMER_BRANCHES_'+shop:'';}
function customerBranches_(){const key=customerBranchesPropertyKey_();if(!key)throw new Error('Customer shop context is required.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty(key)||'[]')}catch(e){rows=[]}return Array.isArray(rows)?rows:[];}
function getCustomerBranches(request){customerBranchActor_(request);return customerBranches_();}
function saveCustomerBranch(request){const ctx=customerBranchActor_(request),name=cleanText_(request&&request.name);if(!name)throw new Error('Enter the branch name.');if(name.length>100)throw new Error('Branch name is too long.');const rows=customerBranches_(),id=cleanText_(request&&request.id)||'BR-'+AppUtilities.getUuid().slice(0,10).toUpperCase(),existing=rows.find(x=>x.id===id),row=existing||{id:id,createdAt:new Date().toISOString()};row.name=name;row.address=cleanText_(request&&request.address);row.phone=cleanText_(request&&request.phone);row.manager=cleanText_(request&&request.manager);row.active=request&&request.active===false?false:true;row.updatedAt=new Date().toISOString();if(!existing)rows.push(row);AppProperties.getScriptProperties().setProperty(customerBranchesPropertyKey_(),JSON.stringify(rows));return rows;}
function generateShopActivationKeyFromMaster(actorPin) {
  setActiveShop_('');
  const actor = accountForPin_(actorPin);
  if (!actor || actor.role !== 'OWNER' || activeShopCode_()) throw new Error('Only the Master Owner can generate an activation key.');
  return { activationKey: shopActivationKey_() };
}
function renewShopActivationKeyFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can renew an activation key.');
  if(!shop)throw new Error('Select a customer shop.');
  return withLock_(function(){
    const shops=mergeShopRegistrySources_(shopDatabaseConfig_()),record=shops[shop];
    if(!record)throw new Error('Customer shop not found.');
    if(record.demoMode)throw new Error('Trial versions do not use an activation key.');
    let key=shopActivationKey_();
    while(Object.keys(shops).some(function(code){return code!==shop&&normalizeActivationKey_(shops[code]&&shops[code].activationCode)===normalizeActivationKey_(key);}))key=shopActivationKey_();
    record.activationCode=key;
    record.activationCodeExpiresAt=shopLicenseTierExpiresAt_(record.licenseTier||'FIRST_PURCHASE');
    record.active=true;record.status='ACTIVE';record.updatedAt=new Date().toISOString();
    saveShopDatabaseConfig_(shops);
    return{shopCode:shop,activationCode:key,activationCodeExpiresAt:record.activationCodeExpiresAt,status:record.status};
  });
}
function convertTrialToRegularFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can convert a trial account.');
  if(!shop)throw new Error('Select a customer shop.');
  return withLock_(function(){
    const shops=mergeShopRegistrySources_(shopDatabaseConfig_()),record=shops[shop];
    if(!record)throw new Error('Customer shop not found.');
    if(!record.demoMode)throw new Error('This customer account is already a regular version.');
    let key=shopActivationKey_();
    while(Object.keys(shops).some(function(code){return code!==shop&&normalizeActivationKey_(shops[code]&&shops[code].activationCode)===normalizeActivationKey_(key);}))key=shopActivationKey_();
    record.demoMode=false;record.demoTrialDays=0;record.demoExpiresAt='';record.licenseTier='FIRST_PURCHASE';record.activationCode=key;record.activationCodeExpiresAt=shopLicenseTierExpiresAt_('FIRST_PURCHASE');record.active=true;record.status='ACTIVE';record.updatedAt=new Date().toISOString();
    saveShopDatabaseConfig_(shops);
    return{shopCode:shop,activationCode:key,activationCodeExpiresAt:record.activationCodeExpiresAt,status:record.status,converted:true};
  });
}

// Issue a unique Master-controlled key for the selected customer and package.
// Demo/Trial access never receives a license key.
function generateLicenseKeyForTierFromMaster(request) {
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),tier=cleanText_(request&&request.licenseTier).toUpperCase();
  const valid=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'];
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can generate license keys.');
  if(!shop||valid.indexOf(tier)<0)throw new Error('Select a customer and a valid license package.');
  return withLock_(function(){
    const shops=mergeShopRegistrySources_(shopDatabaseConfig_()),record=shops[shop];
    if(!record)throw new Error('Customer shop not found.');
    if(record.demoMode)throw new Error('Demo/Trial accounts do not receive a license key. Convert after payment review.');
    let key=shopActivationKey_();
    while(Object.keys(shops).some(function(code){return code!==shop&&normaliseActivationKey_(shops[code]&&shops[code].activationCode)===normaliseActivationKey_(key);}))key=shopActivationKey_();
    record.licenseTier=tier;record.activationCode=key;record.activationCodeExpiresAt=shopLicenseTierExpiresAt_(tier);record.active=true;record.status='ACTIVE';record.updatedAt=new Date().toISOString();
    saveShopDatabaseConfig_(shops);
    return{shopCode:shop,licenseTier:tier,activationCode:key,activationCodeExpiresAt:record.activationCodeExpiresAt,status:record.status};
  });
}
function listLicensePaymentProofsFromMaster(request){
  setActiveShop_('');const actor=accountForPin_(request&&request.actorPin);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can view payment slips.');
  let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PAYMENT_PROOFS')||'[]')}catch(e){rows=[];}
  return rows.map(function(x){return{id:x.id,shopCode:x.shopCode,shopName:x.shopName,requestedBy:x.requestedBy,licenseTier:x.licenseTier,amount:x.amount,slipDataUrl:x.slipDataUrl,createdAt:x.createdAt,status:x.status};}).reverse();
}
function decideLicensePaymentProofFromMaster(request){
  setActiveShop_('');const actor=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.id),approved=request&&request.approved===true;
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can review payment slips.');
  if(!id)throw new Error('Select a payment slip.');
  return withLock_(function(){
    let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PAYMENT_PROOFS')||'[]')}catch(e){rows=[];}
    const item=rows.find(function(x){return x.id===id;});if(!item)throw new Error('Payment slip not found.');
    if(!approved){item.status='REJECTED';item.reviewedAt=new Date().toISOString();AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PAYMENT_PROOFS',JSON.stringify(rows));return item;}
    const result=generateLicenseKeyForTierFromMaster({actorPin:request.actorPin,shopCode:item.shopCode,licenseTier:item.licenseTier});
    item.status='APPROVED';item.reviewedAt=new Date().toISOString();item.activationCode=result.activationCode;item.activationCodeExpiresAt=result.activationCodeExpiresAt;AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PAYMENT_PROOFS',JSON.stringify(rows));return item;
  });
}
function enableMasterSupportAccess(request){
  setActiveShop_('');
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can enable customer support access.');
  if(!shop)throw new Error('Select a customer shop.');
  return withLock_(function(){
    const shops=shopDatabaseConfig_(),record=shops[shop];
    if(!shopRecordIsActive_(record))throw new Error('This shop link is inactive. Activate it first.');
    const key='POS_ACCESS_CONFIG_SHOP_'+shop;
    let config;
    try{config=JSON.parse(AppProperties.getScriptProperties().getProperty(key)||'');}catch(e){config=null;}
    if(!config||!Array.isArray(config.accounts)){setActiveShop_(shop);config=posAccessConfig_();setActiveShop_('');}
    let support=config.accounts.find(function(a){return a.id==='master-owner-support';});
    if(!support){support={id:'master-owner-support',name:'Software Owner Support',role:'SUPER_ADMIN',parentId:'',active:true,permissions:allPermissions_()};config.accounts.push(support);}
    support.name=actor.name||'Software Owner Support';
    support.role='SUPER_ADMIN';
    support.active=true;
    support.pinHash=actor.pinHash;
    support.permissions=allPermissions_();
    support.permissions.manageAccounts=true;
    AppProperties.getScriptProperties().setProperty(key,JSON.stringify(config));
    const serviceUrl=RuntimeApp.getService().getUrl();
    return{shopCode:shop,shopName:cleanText_(record.shopName)||shop,link:serviceUrl+'?shop='+encodeURIComponent(shop),supportUsername:support.name,status:'SUPPORT_ENABLED'};
  });
}
function recordShopActivity(request) {
  const shop=normaliseShopCode_(request&&request.shopCode),actor=accountForPin_(request&&request.actorPin);
  if(!shop||!actor||activeShopCode_()!==shop)return {recorded:false};
  return withLock_(function(){const shops=shopDatabaseConfig_(),entry=shops[shop];if(!shopRecordIsActive_(entry))return{recorded:false};const now=new Date().toISOString();if(!entry.firstOpenedAt)entry.firstOpenedAt=now;entry.lastActiveAt=now;entry.lastAccountName=cleanText_(actor.name);saveShopDatabaseConfig_(shops);return{recorded:true};});
}
function getMasterShopDashboard(actorPin) {
  setActiveShop_('');
  const actor=accountForPin_(actorPin);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Master Owner can view this dashboard.');
  const serviceUrl=RuntimeApp.getService().getUrl(),now=Date.now(),shops=mergeShopRegistrySources_(shopDatabaseConfig_());
  const changed=[];Object.keys(shops).forEach(function(code){const item=shops[code];const tier=item&&item.licenseTier||'FIRST_PURCHASE';if(item&& !item.demoMode&& !cleanText_(item.activationCode)){item.activationCode=shopActivationKey_();item.activationCodeExpiresAt=shopLicenseTierExpiresAt_(tier);changed.push(code);}else if(item&& !item.demoMode&& !cleanText_(item.activationCodeExpiresAt)){item.activationCodeExpiresAt=shopLicenseTierExpiresAt_(tier);changed.push(code);}});
  if(changed.length)saveShopDatabaseConfig_(shops);
  const rows=Object.keys(shops).sort().map(function(code){const item=shops[code]||{},time=item.lastActiveAt?new Date(item.lastActiveAt).getTime():0,enabled=shopRecordIsActive_(item),details=item.customerDetails||{},expired=shopActivationKeyExpired_(item);return{shopCode:code,softwareCode:cleanText_(item.softwareCode),shopName:cleanText_(item.shopName)||code,projectId:cleanText_(item.projectId),businessType:cleanText_(details.businessType),allowedRoles:normaliseAllowedShopRoles_(item.allowedRoles,details.businessType),adminPermissions:permissionsForConfiguredShop_(item.adminPermissions||{}),link:serviceUrl+'?shop='+encodeURIComponent(code),installed:!!item.firstOpenedAt,firstOpenedAt:cleanText_(item.firstOpenedAt),lastActiveAt:cleanText_(item.lastActiveAt),lastAccountName:cleanText_(item.lastAccountName),enabled:enabled,activationStatus:enabled?'ACTIVE':'INACTIVE',activityStatus:time&&now-time<300000?'ONLINE':'OFFLINE',activationCode:cleanText_(item.activationCode),activationCodeExpiresAt:cleanText_(item.activationCodeExpiresAt),activationCodeExpired:expired,monthlyFee:Number(item.monthlyFee||0),billingPeriod:cleanText_(item.billingPeriod)||'MONTHLY',subscriptionDueDate:cleanText_(item.subscriptionDueDate),subscriptionStatus:cleanText_(item.subscriptionStatus)||'NOT_SET',lastPaymentDate:cleanText_(item.lastPaymentDate),subscriptionPayments:item.subscriptionPayments||[]};});
  return {shops:rows,total:rows.length,active:rows.filter(function(row){return row.enabled;}).length};
}
function setShopSubscriptionFromMaster(request){
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can manage subscriptions.');
  if(!shop)throw new Error('Select a customer shop.');
  const fee=Number(request&&request.monthlyFee||request&&request.fee||0),period=cleanText_(request&&request.billingPeriod).toUpperCase()||'MONTHLY',due=cleanText_(request&&request.dueDate),status=cleanText_(request&&request.status).toUpperCase()||'UNPAID';
  if(!isFinite(fee)||fee<0)throw new Error('Enter a valid monthly fee.');
  if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))throw new Error('Enter a valid due date.');
  if(!['PAID','UNPAID','SUSPENDED','NOT_SET'].includes(status))throw new Error('Invalid subscription status.');
  if(!['MONTHLY','YEARLY','ONE_TIME'].includes(period))throw new Error('Invalid billing period.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Customer shop not found.');record.monthlyFee=round2_(fee);record.billingPeriod=period;record.subscriptionDueDate=due;record.subscriptionStatus=status;record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,monthlyFee:record.monthlyFee,billingPeriod:period,subscriptionDueDate:due,subscriptionStatus:status};});
}
function setShopLicenseDaysFromMaster(request){
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),mode=cleanText_(request&&request.mode).toUpperCase()||'SET',days=Number(request&&request.days);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can change customer license days.');
  if(!shop||!isFinite(days)||days<0||days>12775)throw new Error('Enter license days from 0 to 12775.');
  if(!['SET','ADD','SUBTRACT'].includes(mode))throw new Error('Invalid license days action.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Customer shop not found.');const trial=!!record.demoMode,key=trial?'demoExpiresAt':'activationCodeExpiresAt',current=cleanText_(record[key]),currentDays=current?Math.max(0,Math.ceil((new Date(current).getTime()-Date.now())/86400000)):0;let next=mode==='ADD'?currentDays+days:mode==='SUBTRACT'?Math.max(0,currentDays-days):days;if(trial&&next!==7&&next!==15)throw new Error('Demo version can be 7 or 15 days only.');record[key]=new Date(Date.now()+next*86400000).toISOString();record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,licenseDays:next,licenseExpiresAt:record[key],licenseType:trial?'TRIAL':'REGULAR'};});
}
function recordShopSubscriptionPayment(request){
  const actor=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),amount=Number(request&&request.amount||0),paidDate=cleanText_(request&&request.paidDate)||AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd'),nextDue=cleanText_(request&&request.nextDueDate);
  if(!actor||actor.role!=='OWNER'||activeShopCode_())throw new Error('Only the Software Owner can record customer subscription payments.');
  if(!shop||!isFinite(amount)||amount<=0)throw new Error('Select a shop and enter a valid payment.');
  return withLock_(function(){const shops=shopDatabaseConfig_(),record=shops[shop];if(!record)throw new Error('Customer shop not found.');record.subscriptionPayments=Array.isArray(record.subscriptionPayments)?record.subscriptionPayments:[];record.subscriptionPayments.push({amount:round2_(amount),paidDate:paidDate,nextDueDate:nextDue,period:cleanText_(request&&request.billingPeriod).toUpperCase()||record.billingPeriod||'MONTHLY',recordedAt:new Date().toISOString(),recordedBy:actor.name});record.lastPaymentDate=paidDate;record.subscriptionDueDate=nextDue||record.subscriptionDueDate;record.subscriptionStatus='PAID';record.active=true;record.status='ACTIVE';record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);return{shopCode:shop,amount:round2_(amount),paidDate:paidDate,nextDueDate:record.subscriptionDueDate,subscriptionStatus:'PAID'};});
}
function openingBalancePropertyKey_(){const shop=activeShopCode_();const day=AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd');return 'POS_OPENING_BALANCE_'+(shop||'MASTER')+'_'+day;}
function getDailyOpeningBalance(actorPin) {
  setShopContextFromRequest_({actorPin:actorPin});
  const actor=accountForPin_(actorPin),shop=activeShopCode_();
  if(!actor||!shop)return {required:false};
  const settings=getSettings_(getSpreadsheet_()); if(String(settings.CASH_BALANCE_ENABLED||'YES').toUpperCase()==='NO')return {enabled:false,required:false};
  const raw=AppProperties.getScriptProperties().getProperty(openingBalancePropertyKey_());
  if(!raw)return {required:true,date:AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd')};
  try{const saved=JSON.parse(raw);return {required:false,date:saved.date,amount:saved.amount,enteredAt:saved.enteredAt};}catch(e){return {required:true};}
}
function saveDailyOpeningBalance(request) {
  setShopContextFromRequest_(request);
  const actor=accountForPin_(request&&request.actorPin),shop=activeShopCode_(),amount=Number(request&&request.amount);
  if(!actor||!shop)throw new Error('Opening balance is available only for a shop billing software.');
  if(String(getSettings_(getSpreadsheet_()).CASH_BALANCE_ENABLED||'YES').toUpperCase()==='NO')throw new Error('Opening / Closing Balance is disabled for this Shop.');
  if(!isFinite(amount)||amount<0)throw new Error('Enter a valid opening balance.');
  const value={date:AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd'),amount:amount,enteredAt:new Date().toISOString(),enteredBy:cleanText_(actor.name)};
  AppProperties.getScriptProperties().setProperty(openingBalancePropertyKey_(),JSON.stringify(value));
  return value;
}
function closingBalancePropertyKey_(){const shop=activeShopCode_();const day=AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd');return 'POS_CLOSING_BALANCE_'+(shop||'MASTER')+'_'+day;}
function getDailyClosingBalance(actorPin){setShopContextFromRequest_({actorPin:actorPin});const actor=accountForPin_(actorPin),shop=activeShopCode_();if(!actor||!shop)return{required:false};if(String(getSettings_(getSpreadsheet_()).CASH_BALANCE_ENABLED||'YES').toUpperCase()==='NO')return{enabled:false,required:false};const raw=AppProperties.getScriptProperties().getProperty(closingBalancePropertyKey_());if(!raw)return{enabled:true,required:true,date:AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd')};try{return{enabled:true,required:false,record:JSON.parse(raw)};}catch(e){return{enabled:true,required:true};}}
function saveDailyClosingBalance(request){setShopContextFromRequest_(request);const actor=accountForPin_(request&&request.actorPin),shop=activeShopCode_(),amount=Number(request&&request.amount),note=cleanText_(request&&request.note);if(!actor||!shop)throw new Error('Closing balance is available only for a shop billing software.');if(String(getSettings_(getSpreadsheet_()).CASH_BALANCE_ENABLED||'YES').toUpperCase()==='NO')throw new Error('Opening / Closing Balance is disabled for this Shop.');if(!isFinite(amount)||amount<0)throw new Error('Enter a valid closing balance.');const value={date:AppUtilities.formatDate(new Date(),'Asia/Colombo','yyyy-MM-dd'),amount:amount,note:note,enteredAt:new Date().toISOString(),enteredBy:cleanText_(actor.name)};AppProperties.getScriptProperties().setProperty(closingBalancePropertyKey_(),JSON.stringify(value));return value;}
function setActiveShopFromLink(shopCode){return getDatabaseSetupStatus(shopCode);}

function saveBill(request) {
  if (!request || !Array.isArray(request.items) || !request.items.length) {
    throw new Error('Please add at least one item.');
  }
  if (!cleanText_(request.customerPhone)) throw new Error('Customer phone is required.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const settings = getSettings_(ss);
    const products = getProducts_(ss);
    const productMap = Object.fromEntries(products.map(function (p) { return [p.id, p]; }));
    const items = normaliseSaleItems_(request.items, productMap);
    const billDiscount = nonNegative_(request.billDiscount, 'Bill discount');
    const subtotal = round2_(items.reduce(function (sum, item) { return sum + item.lineTotal; }, 0));
    if (billDiscount > subtotal) throw new Error('Bill discount cannot be more than the subtotal.');

    validateStock_(items, productMap);
    const billNo = nextBillNo_(settings);
    const now = new Date();
    const total = round2_(subtotal - billDiscount);
    const paymentMethod = cleanText_(request.paymentMethod).toUpperCase() || 'CASH';
    const checkNo = cleanText_(request.checkNo);
    const checkDate = cleanText_(request.checkDate);
    if (checkNo && paymentMethod !== 'CHECK') throw new Error('Check number is only for check payments.');
    if (paymentMethod === 'CHECK' && !checkNo) throw new Error('Enter the check number.');
    const paidAmount = request.paidAmount === undefined || request.paidAmount === null || cleanText_(request.paidAmount) === '' ? total : nonNegative_(request.paidAmount, 'Customer paid amount');
    const changeAmount = round2_(Math.max(0, paidAmount - total));
    const creditBalance = round2_(Math.max(0, total - paidAmount));
    let creditCustomer;
    if (creditBalance > 0) {
      creditCustomer=getOrCreateCreditCustomer_(ss,settings,cleanText_(request.customerName),cleanText_(request.customerPhone));
      const outstanding=getCustomerOutstanding_(ss,creditCustomer.key);
      if(round2_(outstanding+creditBalance)>creditCustomer.creditLimit)throw new Error('Credit limit exceeded for '+creditCustomer.name+'. Available credit: '+round2_(Math.max(0,creditCustomer.creditLimit-outstanding))+'.');
    }
    const costTotal = round2_(items.reduce(function (sum, item) { return sum + item.cost * item.qty; }, 0));
    const bills = getSheet_(ss, APP.SHEETS.BILLS);
    ensureHeaders_(bills, billHeaders_());

    decrementStock_(ss, items, productMap);
    bills.appendRow([billNo, now, cleanText_(request.customerPhone), JSON.stringify({
      version: 3, customerName: cleanText_(request.customerName), customerAddress: cleanText_(request.customerAddress), items: items, subtotal: subtotal, billDiscount: billDiscount, paymentMethod: paymentMethod, checkNo: checkNo, checkDate: checkDate, paidAmount:paidAmount, changeAmount:changeAmount, creditBalance:creditBalance, total: total
    }), total, costTotal, round2_(total - costTotal), 'SALE', '']);
    if(creditBalance>0){const ledger=getOrCreateSheet_(ss,APP.SHEETS.CREDIT_LEDGER);ensureHeaders_(ledger,creditLedgerHeaders_());ledger.appendRow([now,creditCustomer.key,creditCustomer.name,creditCustomer.phone,'CREDIT SALE',billNo,creditBalance,0,creditBalance,'Partial payment at sale']);}
    setSetting_(ss, 'NEXT_BILL_NUMBER', Number(settings.NEXT_BILL_NUMBER || APP.DEFAULTS.NEXT_BILL_NUMBER) + 1);

    return receiptFromRecord_({
      billNo: billNo, date: now, customerPhone: cleanText_(request.customerPhone), customerAddress: cleanText_(request.customerAddress),
      items: items, subtotal: subtotal, billDiscount: billDiscount, paymentMethod: paymentMethod, checkNo: checkNo, checkDate: checkDate, paidAmount:paidAmount, changeAmount:changeAmount, creditBalance:creditBalance, total: total,
      type: 'SALE', relatedBill: ''
    }, settings);
  });
}

function findBill(query) {
  const billNo = cleanText_(query).toUpperCase();
  if (!billNo) throw new Error('Enter a bill number.');
  const ss = getSpreadsheet_();
  const settings = getSettings_(ss);
  const rows = getSheet_(ss, APP.SHEETS.BILLS).getDataRange().getValues();
  const row = rows.slice(1).find(function (r) { return String(r[0]).toUpperCase() === billNo; });
  if (!row) throw new Error('Bill not found: ' + billNo);
  return receiptFromRow_(row, settings);
}

/** Lists recent sale bills so staff can reprint an issued bill without typing its number. */
function listRecentBills() {
  const bills = getSheet_(getSpreadsheet_(), APP.SHEETS.BILLS);
  if (bills.getLastRow() < 2) return [];
  return bills.getDataRange().getValues().slice(1)
    .filter(function (row) { return cleanText_(row[7]).toUpperCase() === 'SALE'; })
    .slice(-100).reverse()
    .map(function (row) { return { billNo: cleanText_(row[0]), date: new Date(row[1]).toLocaleString(), total: Number(row[4] || 0) }; });
}

/** Saves a bill-payment transaction without changing stock or sales records. */
function savePayment(request) {
  if (!request) throw new Error('Payment details are required.');
  const wallet = cleanText_(request.wallet);
  const bank = cleanText_(request.bank);
  const biller = cleanText_(request.biller);
  if (!wallet) throw new Error('Select a wallet.');
  if (!biller) throw new Error('Select a service / biller.');
  const customerId = cleanText_(request.customerId);
  const customerName = cleanText_(request.customerName);
  const customerMobile = cleanText_(request.customerMobile);
  const customerAddress = cleanText_(request.customerAddress);
  const accountNo = cleanText_(request.accountNo);
  const paymentMethod = cleanText_(request.paymentMethod).toUpperCase() || 'CASH';
  const checkNo = cleanText_(request.checkNo);
  const amount = positive_(request.amount, 'Amount');
  const requestedServiceCharge = nonNegative_(request.serviceCharge, 'Service charge');
  const requestedCardCharge = nonNegative_(request.cardCharge, 'Card charge');
  const requestedCardChargePct = nonNegative_(request.cardChargePct, 'Card charge');
  const refNo = cleanText_(request.refNo);
  if (!customerId) throw new Error('Select a saved customer.');
  if (accountNo && !/^\d+$/.test(accountNo)) throw new Error('Account No must contain numbers only.');
  if (checkNo && paymentMethod !== 'CHECK') throw new Error('Check number is only for check payments.');
  if (paymentMethod === 'CHECK' && !checkNo) throw new Error('Enter the check number.');
  if (refNo && !/^\d+$/.test(refNo)) throw new Error('Ref No must contain numbers only.');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const settings = getSettings_(ss);
    const payments = getOrCreateSheet_(ss, APP.SHEETS.PAYMENTS);
    ensureHeaders_(payments, paymentHeaders_());
    const customers = getCustomers_();
    const customer = customers.find(function (c) { return c.id === customerId; });
    if (!customer) throw new Error('Selected customer was not found.');
    // The value entered in the Bill Payment application is authoritative.
    // Payment Setup provides the initial value, but must not overwrite a
    // manually entered Rs amount or percentage calculated by the application.
    const serviceCharge=requestedServiceCharge;
    const cardCharge = paymentMethod === 'CARD'
      ? (requestedCardChargePct > 0 ? round2_(amount * requestedCardChargePct / 100) : requestedCardCharge)
      : 0;
    const receiptNo = nextPaymentNo_(settings);
    const now = new Date();
    const totalAmount = round2_(amount + serviceCharge + cardCharge);
    payments.appendRow([receiptNo, now, wallet, biller, customer.phone || customerMobile, accountNo, amount, serviceCharge, totalAmount, refNo, customer.address || customerAddress, paymentMethod, '', bank, customer.name || customerName, customer.id, cardCharge, requestedCardChargePct || '']);
    setSetting_(ss, 'NEXT_PAYMENT_NUMBER', Number(settings.NEXT_PAYMENT_NUMBER || APP.DEFAULTS.NEXT_PAYMENT_NUMBER) + 1);
    return paymentReceiptFromRow_([receiptNo, now, wallet, biller, customer.phone || customerMobile, accountNo, amount, serviceCharge, totalAmount, refNo, customer.address || customerAddress, paymentMethod, '', bank, customer.name || customerName, customer.id, cardCharge, requestedCardChargePct || ''], settings);
  });
}

/** Returns an already-issued payment receipt for reprinting. */
function saveInvoiceStockPurchase(r){
  requireAdminPin_(r&&r.adminPin);
  if(!r)throw new Error('Purchase details are required.');
  const c=cleanText_(r.companyName),ref=cleanText_(r.referenceNo),id=cleanText_(r.itemId),q=positive_(r.qty,'Quantity'),cost=nonNegative_(r.unitCost,'Unit cost');
  if(!c||!ref||!id)throw new Error('Enter company name, reference number and item.');
  return withLock_(function(){
    const ss=getSpreadsheet_(),s=getSettings_(ss),p=getProducts_(ss,APP.SHEETS.INVOICE_STOCK).find(x=>x.id===id);
    if(!p)throw new Error('Item is missing from Invoice Stock.');
    const sh=getOrCreateSheet_(ss,APP.SHEETS.PURCHASES),no='PUR-'+String(Math.max(1,Number(s.NEXT_PURCHASE_NUMBER||1))).padStart(4,'0'),total=round2_(q*cost);
    const serials=serialBatchFromRequest_(r,q);
    ensureHeaders_(sh,['Purchase No','Date & Time','Supplier / Company','Reference No','Item ID','Item Name','Qty','Unit Cost','Total Investment','Notes']);
    adjustStock_(ss,id,q,APP.SHEETS.INVOICE_STOCK);
    sh.appendRow([no,new Date(),c,ref,id,p.name,q,cost,total,cleanText_(r.notes)]);
    if(serials.length)appendSerialStock_(ss,{purchaseNo:no,itemId:id,itemName:p.name,warranty:cleanText_(r.warranty||p.warranty),serials:serials});
    appendActivityLog_(ss,'Stock Purchase','ADD','PURCHASE',no,p.name,'Supplier: '+c+' | Item: '+p.name+' | Qty: '+String(q)+' | Total: '+String(total),cleanText_(r.adminPin) ? accountForPin_(r.adminPin).name : '');
    setSetting_(ss,'NEXT_PURCHASE_NUMBER',Number(s.NEXT_PURCHASE_NUMBER||1)+1);
    return{purchaseNo:no,itemName:p.name,qty:q,serialCount:serials.length};
  });
}
function serialStockHeaders_(){return ['Serial ID','Added At','Purchase No','Item ID','Item Name','Serial Number','Warranty','Status','Sold Ref','Sold At'];}
function serialBatchFromRequest_(request, qty){
  const typed=Array.isArray(request.serials)?request.serials.join('\n'):cleanText_(request.serials||request.serialList);
  let list=typed?typed.split(/[\n,;]+/).map(cleanText_).filter(Boolean):[];
  const start=cleanText_(request.serialStart),end=cleanText_(request.serialEnd);
  if(start&&end)list=list.concat(serialRange_(start,end));
  list=list.filter(function(value,index,self){return self.indexOf(value)===index;});
  if(list.length&&list.length!==qty)throw new Error('Serial count must match purchase quantity. Quantity: '+qty+', serials: '+list.length+'.');
  return list;
}
function serialRange_(start,end){
  const a=String(start).match(/^(.*?)(\d+)$/),b=String(end).match(/^(.*?)(\d+)$/);
  if(!a||!b||a[1]!==b[1])throw new Error('Serial start and end must use the same prefix and a numeric ending.');
  const from=Number(a[2]),to=Number(b[2]),width=a[2].length;
  if(!isFinite(from)||!isFinite(to)||to<from)throw new Error('Serial end must be greater than or equal to serial start.');
  if(to-from>500)throw new Error('Serial range is too large. Add 500 serials or fewer at once.');
  const out=[];for(let n=from;n<=to;n++)out.push(a[1]+String(n).padStart(width,'0'));return out;
}
function appendSerialStock_(ss,batch){
  const sh=getOrCreateSheet_(ss,APP.SHEETS.SERIAL_STOCK);ensureHeaders_(sh,serialStockHeaders_());
  const existing={};if(sh.getLastRow()>1)sh.getDataRange().getValues().slice(1).forEach(function(r){existing[cleanText_(r[5]).toUpperCase()]=true;});
  batch.serials.forEach(function(serial){
    const key=cleanText_(serial).toUpperCase();if(existing[key])throw new Error('Serial number already exists in stock: '+serial);
    existing[key]=true;sh.appendRow(['SER-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),new Date(),batch.purchaseNo,batch.itemId,batch.itemName,serial,batch.warranty,'AVAILABLE','','']);
  });
}
/** Returns the current Invoice Stock items for the Stock Purchase selector. */
function getInvoiceStockProducts() {
  const ss = getSpreadsheet_();
  return ensureInvoiceStockMatchesNewBill_(ss);
}

/** Supplier master list used by Stock Purchase. */
function getSuppliers() {
  const sh = getOrCreateSheet_(getSpreadsheet_(), APP.SHEETS.SUPPLIERS);
  ensureHeaders_(sh, ['Supplier ID','Company Name','Contact Person','Phone','Email','Address','Status']);
  if (sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(function(r){ return cleanText_(r[0]) && String(r[6] || 'ACTIVE').toUpperCase() !== 'NO'; }).map(function(r){ return {id:cleanText_(r[0]),name:cleanText_(r[1]),contact:cleanText_(r[2]),phone:cleanText_(r[3]),email:cleanText_(r[4]),address:cleanText_(r[5])}; });
}

/** Creates a reusable supplier record. Duplicate company names reuse the existing record. */
function saveSupplier(request) {
  requireAdminPin_(request && request.adminPin);
  const name = cleanText_(request && request.name);
  if (!name) throw new Error('Enter the supplier company name.');
  return withLock_(function(){
    const ss=getSpreadsheet_(),sh=getOrCreateSheet_(ss, APP.SHEETS.SUPPLIERS);
    ensureHeaders_(sh, ['Supplier ID','Company Name','Contact Person','Phone','Email','Address','Status']);
    const rows=sh.getDataRange().getValues(), found=rows.slice(1).find(function(r){return cleanText_(r[1]).toLowerCase()===name.toLowerCase();});
    if(found)return {id:cleanText_(found[0]),name:cleanText_(found[1]),existing:true};
    const id='SUP-'+AppUtilities.getUuid().slice(0,8).toUpperCase();
    sh.appendRow([id,name,cleanText_(request.contact),cleanText_(request.phone),cleanText_(request.email),cleanText_(request.address),'ACTIVE']);
    return {id:id,name:name,existing:false};
  });
}

function saveCustomerRequestMessage(request) {
  const actor = accountForPin_(request && request.actorPin);
  if (!actor) throw new Error('Login required.');
  const shop = activeShopCode_();
  if (!shop) throw new Error('Customer messages are available from a shop link.');
  const message = cleanText_(request && request.message);
  if (!message) throw new Error('Enter a customer message.');
  const item = {
    id: 'CRM-' + AppUtilities.getUuid().slice(0, 10).toUpperCase(),
    createdAt: new Date().toISOString(),
    customerName: cleanText_(request && request.customerName),
    customerPhone: cleanText_(request && request.customerPhone),
    message: message,
    createdBy: cleanText_(actor.name),
    shopCode: shop
  };
  return withLock_(function() {
    const key = 'POS_CUSTOMER_REQUESTS_' + shop;
    let rows = [];
    try { rows = JSON.parse(AppProperties.getScriptProperties().getProperty(key) || '[]'); }
    catch (e) { rows = []; }
    rows.unshift(item);
    AppProperties.getScriptProperties().setProperty(key, JSON.stringify(rows.slice(0, 200)));
    return item;
  });
}

/** Saves a CCTV camera installation/service application for the current shop.
 * Kept separate from quotations and job notes so the advance is never lost. */
function saveCctvApplication(request) {
  const actor = requirePermission_(request && request.actorPin, 'cctvPackage');
  const r = request || {}, customerName = cleanText_(r.customerName), packageName = cleanText_(r.packageName);
  if (!customerName || !packageName) throw new Error('Enter the customer name and CCTV package/service.');
  const amount = Number(r.amount || 0), advance = Number(r.advance || 0);
  if (!isFinite(amount) || amount < 0 || !isFinite(advance) || advance < 0 || advance > amount) throw new Error('Enter valid package and advance amounts.');
  const sh = getOrCreateSheet_(getSpreadsheet_(), 'CCTV Applications');
  ensureHeaders_(sh, ['Application No','Date & Time','Customer Name','Phone','Address','Package / Service','Camera Qty','Package Amount','Advance Amount','Balance','Details','Created By','Shop Code']);
  const no = 'CCTV-' + AppUtilities.getUuid().slice(0, 8).toUpperCase();
  sh.appendRow([no, new Date(), customerName, cleanText_(r.phone), cleanText_(r.address), packageName, Number(r.cameraQty || 0), amount, advance, Math.max(0, amount - advance), cleanText_(r.details), actor.name, activeShopCode_() || 'MASTER']);
  return { applicationNo:no, balance:Math.max(0, amount - advance) };
}

function listCustomerRequestMessages(actorPin) {
  const actor = accountForPin_(actorPin);
  if (!actor) throw new Error('Login required.');
  const shop = activeShopCode_();
  if (!shop) throw new Error('Customer messages are available from a shop link.');
  const key = 'POS_CUSTOMER_REQUESTS_' + shop;
  let rows = [];
  try { rows = JSON.parse(AppProperties.getScriptProperties().getProperty(key) || '[]'); }
  catch (e) { rows = []; }
  return rows;
}

/** Master Owner inbox: combines help/support messages from every sold shop. */
function listAllCustomerRequestMessages(actorPin) {
  setActiveShop_('');
  const actor = accountForPin_(actorPin);
  if (!actor || actor.role !== 'OWNER' || activeShopCode_()) throw new Error('Only the Master Owner can view all customer requests.');
  const props = AppProperties.getScriptProperties(), shops = shopDatabaseConfig_(), out = [];
  Object.keys(shops).forEach(function(shopCode) {
    let rows = [];
    try { rows = JSON.parse(props.getProperty('POS_CUSTOMER_REQUESTS_' + shopCode) || '[]'); } catch (e) { rows = []; }
    rows.forEach(function(row) { out.push(Object.assign({shopCode:shopCode, shopName:cleanText_(shops[shopCode].shopName)||shopCode}, row)); });
  });
  return out.sort(function(a,b){ return String(b.createdAt||'').localeCompare(String(a.createdAt||'')); });
}

/** Adds a product or service from the application instead of directly editing a sheet. */
function addProduct(request) {
  requireAdminPin_(request && request.adminPin);
  if (!request) throw new Error('Item details are required.');
  const target = cleanText_(request.target);
  if (target !== APP.SHEETS.STOCK && target !== APP.SHEETS.INVOICE_STOCK) throw new Error('Invalid stock location.');
  const name = cleanText_(request.name);
  if (!name) throw new Error('Enter an item or service name.');
  const cost = nonNegative_(request.cost, 'Cost price');
  const price = nonNegative_(request.price, 'Selling price');
  const qty = nonNegative_(request.qty, 'Opening stock');
  const trackStock = cleanText_(request.trackStock).toUpperCase() === 'YES';
  const supplier = cleanText_(request.supplierCompany || request.supplier || request.supplierName);
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const actor = accountForPin_(request && request.adminPin);
    const sheet = getSheet_(ss, target);
    ensureHeaders_(sheet, ['Item ID','Item Name','Cost Price','Selling Price','Stock Qty','Track Stock','Status','Category','Warranty Period','Serial Number','Barcode','Supplier / Company']);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(cleanText_);
    let id = cleanText_(request.id);
    if (!id) id = nextProductId_(rows, target === APP.SHEETS.STOCK ? 'BILL' : 'INV');
    const barcode = cleanText_(request.barcode);
    const idIndex = rows.slice(1).findIndex(function (row) { return cleanText_(row[0]).toUpperCase() === id.toUpperCase(); });
    const barcodeIndex = barcode ? rows.slice(1).findIndex(function (row) { return cleanText_(row[10]).toUpperCase() === barcode.toUpperCase(); }) : -1;
    if (barcode && barcodeIndex >= 0 && barcodeIndex !== idIndex) throw new Error('Barcode already exists: ' + barcode);
    const serials=trackStock?serialBatchFromRequest_(request,qty):[];
    if (idIndex >= 0) {
      const rowNumber = idIndex + 2;
      const existingRow = rows[idIndex + 1];
      const existingQty = Number(existingRow[4] || 0);
      const existingTrack = String(existingRow[5] || '').toUpperCase() === 'YES';
      const keepTrack = existingTrack || trackStock || qty > 0;
      const updatedQty = keepTrack ? round2_(existingQty + qty) : existingQty;
      sheet.getRange(rowNumber, 2, 1, 11).setValues([[
        name,
        cost,
        price,
        updatedQty,
        keepTrack ? 'YES' : 'NO',
        'YES',
        cleanText_(request.category),
        cleanText_(request.warranty),
        serials.length ? serials.map(function (x) { return x.serial || ''; }).filter(Boolean).join('\n') : cleanText_(request.serial),
        barcode || cleanText_(existingRow[10] || ''),
        supplier || cleanText_(existingRow[11] || '')
      ]]);
      if (serials.length) appendSerialStock_(ss,{purchaseNo:'STOCK-ADD',itemId:id,itemName:name,warranty:cleanText_(request.warranty||existingRow[8]),serials:serials});
      appendActivityLog_(ss,target===APP.SHEETS.STOCK?'Stock / New Bill':'Stock / Invoice','UPDATE',target===APP.SHEETS.STOCK?'STOCK':'INVOICE_STOCK',id,name,'Added stock: '+String(qty)+' | Total stock: '+String(updatedQty)+' | Category: '+cleanText_(request.category)+' | Track: '+(keepTrack?'YES':'NO')+(supplier?' | Supplier: '+supplier:''),actor&&actor.name);
      return { id: id, name: name, serialCount: serials.length, updated: true, stockQty: updatedQty };
    }
    sheet.appendRow([id, name, cost, price, trackStock ? qty : 0, trackStock ? 'YES' : 'NO', 'YES', cleanText_(request.category), cleanText_(request.warranty), serials.length ? serials.map(function (x) { return x.serial || ''; }).filter(Boolean).join('\n') : cleanText_(request.serial), barcode, supplier]);
    if(serials.length)appendSerialStock_(ss,{purchaseNo:'OPENING-STOCK',itemId:id,itemName:name,warranty:cleanText_(request.warranty),serials:serials});
    appendActivityLog_(ss,target===APP.SHEETS.STOCK?'Stock / New Bill':'Stock / Invoice','ADD',target===APP.SHEETS.STOCK?'STOCK':'INVOICE_STOCK',id,name,'Opening stock: '+String(qty)+' | Category: '+cleanText_(request.category)+' | Track: '+(trackStock?'YES':'NO')+(supplier?' | Supplier: '+supplier:''),actor&&actor.name);
    return { id: id, name: name, serialCount: serials.length, updated: false, stockQty: trackStock ? qty : 0 };
  });
}

const __shanFinalAddProductBase = addProduct;
addProduct = function(request) {
  return __shanFinalAddProductBase(request);
};

/** Updates cost and selling price. These values are for the shop only and are never printed on customer documents. */
function updateProductPricing(request) {
  requireAdminPin_(request && request.adminPin);
  if (!request) throw new Error('Item details are required.');
  const target = cleanText_(request.target);
  if (target !== APP.SHEETS.STOCK && target !== APP.SHEETS.INVOICE_STOCK) throw new Error('Invalid stock location.');
  const id = cleanText_(request.id);
  if (!id) throw new Error('Select an item.');
  const cost = nonNegative_(request.cost, 'Cost price');
  const price = nonNegative_(request.price, 'Selling price');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const actor = accountForPin_(request && request.adminPin);
    const sheet = getSheet_(ss, target);
    const rows = sheet.getDataRange().getValues();
    const index = rows.slice(1).findIndex(function (row) { return cleanText_(row[0]).toUpperCase() === id.toUpperCase(); });
    if (index < 0) throw new Error('Item not found.');
    const rowNumber = index + 2;
    sheet.getRange(rowNumber, 3, 1, 2).setValues([[cost, price]]);
    appendActivityLog_(ss,target===APP.SHEETS.STOCK?'Stock / New Bill':'Stock / Invoice','UPDATE',target===APP.SHEETS.STOCK?'STOCK':'INVOICE_STOCK',id,cleanText_(rows[index + 1][1]),'Cost: '+String(cost)+' | Price: '+String(price),actor&&actor.name);
    return { id: id, name: cleanText_(rows[index + 1][1]), cost: cost, price: price };
  });
}

/** Payment setup changes are requests; only Master Owner/Super Admin approve them. */
const PAYMENT_SETUP_REQUESTS_SHEET_ = 'Payment Setup Requests';
function sriLankaBankList_(){return ['Amana Bank','Bank of Ceylon (BOC)','Cargills Bank','Commercial Bank of Ceylon','DFCC Bank','HDFC Bank','Hatton National Bank (HNB)','HSBC Sri Lanka','ICBC Sri Lanka','Indian Bank','National Development Bank (NDB)','National Savings Bank (NSB)','Nations Trust Bank','Pan Asia Banking Corporation','People\'s Bank','Sampath Bank','Seylan Bank','Standard Chartered Bank','State Bank of India','Union Bank of Colombo','Bank of China','Deutsche Bank','Habib Bank','Public Bank Berhad','SMIB Bank'];}
function sriLankaFinanceList_(){return ['Abans Finance','Alliance Finance','AMW Capital Leasing','Arpico Finance','Asia Asset Finance','Associated Motor Finance','Bimputh Finance','CDB Finance','Central Finance','Citizen Development Business Finance','Commercial Credit and Finance','Commercial Leasing & Finance','Dialog Finance','Fintrex Finance','HNB Finance','Ideal Finance','Kanrich Finance','L B Finance','Lanka Credit and Business Finance','Lanka ORIX Finance (LOLC Finance)','Mahindra IDEAL Finance','Mercantile Investments and Finance','MBSL Insurance / Finance','Nation Lanka Finance','Orient Finance','People\'s Leasing & Finance','Richard Pieris Finance','Senkadagala Finance','Singer Finance','Softlogic Finance','Trade Finance and Investments','UB Finance','Vallibel Finance'];}
function paymentSetupDefaults_(type){return type==='WALLET'?['eZ Cash','mCash','FriMi','Genie','Koko','PayHere','LankaQR','Cash','Bank','Finance']:type==='BANK'?['Cash Bank','Bank Account']:type==='BANK_SERVICE'?sriLankaBankList_():type==='FINANCE'?sriLankaFinanceList_():['Waterboard - National Water Supply & Drainage Board','CEB - Ceylon Electricity Board','LECO - Lanka Electricity Company','SLT - Sri Lanka Telecom','Dialog','Mobitel','Hutch','Airtel','PickMe','Nuwara Eliya Municipal Council','Other'];}
function paymentSetupRequester_(pin){const actor=accountForPin_(pin);if(!actor)throw new Error('Please log in again.');if(!isTopRole_(actor.role)&&!(actor.permissions||{}).payment)throw new Error('You do not have Bill Payment permission.');return actor;}
function applyPaymentSetupChange_(request){const type=cleanText_(request.type).toUpperCase(),action=cleanText_(request.action).toUpperCase(),name=cleanText_(request.name),oldName=cleanText_(request.oldName),wallet=cleanText_(request.wallet);if(type==='WALLET_BILLER'){if(!wallet)throw new Error('Select the wallet.');if((action==='ADD'||action==='RENAME')&&!name)throw new Error('Enter a service / biller name.');if((action==='RENAME'||action==='DELETE')&&!oldName)throw new Error('Select a service / biller.');const ss=getSpreadsheet_(),settings=getSettings_(ss),map=paymentBillerMap_(settings),list=uniqueList_(map[wallet]||[]);if(action==='ADD'){if(list.some(v=>v.toLowerCase()===name.toLowerCase()))throw new Error('This service already exists for this wallet.');list.push(name);}else{const index=list.findIndex(v=>v.toLowerCase()===oldName.toLowerCase());if(index<0)throw new Error('Service not found for this wallet.');if(action==='RENAME'){if(list.some((v,i)=>i!==index&&v.toLowerCase()===name.toLowerCase()))throw new Error('That service name already exists for this wallet.');list[index]=name;}else if(action==='DELETE')list.splice(index,1);else throw new Error('Invalid payment setup action.');}map[wallet]=uniqueList_(list);setSetting_(ss,'PAYMENT_BILLERS_BY_WALLET',JSON.stringify(map));const all=uniqueList_(paymentOptionList_(settings,'PAYMENT_BILLERS',paymentBillerDefaults_()).concat(map[wallet]));setSetting_(ss,'PAYMENT_BILLERS',JSON.stringify(all));return{type:type,wallet:wallet,action:action,name:name,oldName:oldName,services:map[wallet]};}const key=type==='WALLET'?'PAYMENT_WALLETS':type==='BANK'?'PAYMENT_BANKS':type==='BANK_SERVICE'?'PAYMENT_BANK_SERVICES':type==='FINANCE'?'PAYMENT_FINANCE':type==='BILLER'?'PAYMENT_BILLERS':'';if(!key)throw new Error('Invalid payment option type.');if((action==='ADD'||action==='RENAME')&&!name)throw new Error('Enter a payment option name.');if((action==='RENAME'||action==='DELETE')&&!oldName)throw new Error('Select a payment option.');const ss=getSpreadsheet_(),settings=getSettings_(ss),options=paymentOptionList_(settings,key,paymentSetupDefaults_(type));if(action==='ADD'){if(options.some(v=>v.toLowerCase()===name.toLowerCase()))throw new Error('This payment option already exists.');options.push(name);setSetting_(ss,key,JSON.stringify(options));return{type:type,action:action,name:name};}const index=options.findIndex(v=>v.toLowerCase()===oldName.toLowerCase());if(index<0)throw new Error('Payment option not found.');if(action==='RENAME'){if(options.some((v,i)=>i!==index&&v.toLowerCase()===name.toLowerCase()))throw new Error('That name already exists.');options[index]=name;setSetting_(ss,key,JSON.stringify(options));return{type:type,action:action,oldName:oldName,name:name};}if(action==='DELETE'){options.splice(index,1);setSetting_(ss,key,JSON.stringify(options));return{type:type,action:action,oldName:oldName,deleted:true};}throw new Error('Invalid payment setup action.');}
function submitPaymentSetupRequest(request){const actor=paymentSetupRequester_(request&&request.actorPin),type=cleanText_(request&&request.type).toUpperCase(),action=cleanText_(request&&request.action).toUpperCase(),name=cleanText_(request&&request.name),oldName=cleanText_(request&&request.oldName);if(!['WALLET','BANK','BANK_SERVICE','FINANCE','BILLER'].includes(type)||!['ADD','RENAME','DELETE'].includes(action)||(action!=='DELETE'&&!name)||((action==='RENAME'||action==='DELETE')&&!oldName))throw new Error('Enter valid payment setup details.');return withLock_(function(){const sh=getOrCreateSheet_(getSpreadsheet_(),PAYMENT_SETUP_REQUESTS_SHEET_);ensureHeaders_(sh,['Request ID','Requested At','Requested By','Account Role','Type','Action','Old Name','New Name','Status','Approved By','Approved At']);const id='PSR-'+AppUtilities.getUuid().slice(0,8).toUpperCase();sh.appendRow([id,new Date(),actor.name,actor.role,type,action,oldName,name,'PENDING','','']);return{id:id,status:'PENDING'};});}
function listPaymentSetupRequests(actorPin){const actor=accountForPin_(actorPin);if(!actor||!isTopRole_(actor.role))throw new Error('Only Master Owner or Super Admin can view payment setup requests.');const sh=getSpreadsheet_().getSheetByName(PAYMENT_SETUP_REQUESTS_SHEET_);if(!sh||sh.getLastRow()<2)return[];return sh.getDataRange().getValues().slice(1).map((r,i)=>({row:i+2,id:cleanText_(r[0]),requestedAt:r[1],requestedBy:cleanText_(r[2]),role:cleanText_(r[3]),type:cleanText_(r[4]),action:cleanText_(r[5]),oldName:cleanText_(r[6]),name:cleanText_(r[7]),status:cleanText_(r[8])})).filter(r=>r.status==='PENDING');}
function decidePaymentSetupRequest(request){const actor=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.id),approved=request&&request.approved===true;if(!actor||!isTopRole_(actor.role))throw new Error('Only Master Owner or Super Admin can approve payment setup requests.');return withLock_(function(){const sh=getSpreadsheet_().getSheetByName(PAYMENT_SETUP_REQUESTS_SHEET_);if(!sh)throw new Error('Request not found.');const rows=sh.getDataRange().getValues(),index=rows.slice(1).findIndex(r=>cleanText_(r[0])===id&&cleanText_(r[8])==='PENDING');if(index<0)throw new Error('This request is no longer pending.');const row=rows[index+1],result=approved?applyPaymentSetupChange_({type:row[4],action:row[5],oldName:row[6],name:row[7]}):null;sh.getRange(index+2,9,1,3).setValues([[approved?'APPROVED':'REJECTED',actor.name,new Date()]]);return{approved:approved,result:result};});}
function getPaymentSetupRequestCount(actorPin){const actor=accountForPin_(actorPin);if(!actor||!isTopRole_(actor.role))return{pending:0};return{pending:listPaymentSetupRequests(actorPin).length};}
function addPaymentOption(request){return submitPaymentSetupRequest(Object.assign({},request||{},{action:'ADD'}));}
function managePaymentOption(request){const actor=accountForPin_(request&&request.actorPin);if(!actor||!isTopRole_(actor.role))throw new Error('Only Super Admin can change Payment Setup.');return withLock_(function(){const result=applyPaymentSetupChange_(request||{}),type=cleanText_(request&&request.type).toUpperCase(),action=cleanText_(request&&request.action).toUpperCase(),oldName=cleanText_(request&&request.oldName),name=cleanText_(request&&request.name);if(type==='WALLET'&&['ADD','RENAME','DELETE'].includes(action)){const ss=getSpreadsheet_(),settings=getSettings_(ss),map=paymentBillerMap_(settings);if(action==='ADD'&&!map[name])map[name]=[];if(action==='RENAME'&&oldName&&name){map[name]=map[oldName]||[];delete map[oldName];}if(action==='DELETE'&&oldName)delete map[oldName];setSetting_(ss,'PAYMENT_BILLERS_BY_WALLET',JSON.stringify(map));}return result;});}

/** Shop-owned Bank and Finance ledgers. These are not Bill Payment services. */
const BANK_LEDGER_SHEET_='Bank Transactions';
const FINANCE_LEDGER_SHEET_='Finance Assets';
const FINANCE_PAYMENT_SHEET_='Finance Installments';
function bankFinanceActor_(pin){const account=accountForPin_(pin),permissions=account&&(account.role==='OWNER'?allPermissions_():account.role==='SUPER_ADMIN'?superAdminPermissions_(account):account.permissions||{});if(!account||!(permissions.settings||permissions.payment||permissions.reports))throw new Error('You do not have permission to manage Bank or Finance records.');return account;}
function bankFinanceRows_(sheetName,headers){const sh=getOrCreateSheet_(getSpreadsheet_(),sheetName);ensureHeaders_(sh,headers);return {sheet:sh,rows:sh.getLastRow()>1?sh.getDataRange().getValues().slice(1):[]};}
function getBankFinanceLedger(request){bankFinanceActor_(request&&request.actorPin);const settings=getSettings_(getSpreadsheet_()),banks=paymentOptionList_(settings,'SHOP_BANK_ACCOUNTS',[]),finances=paymentOptionList_(settings,'SHOP_FINANCE_COMPANIES',[]);const bank=bankFinanceRows_(BANK_LEDGER_SHEET_,['Transaction ID','Date','Bank','Account / Reference','Type','Amount','Note','Recorded By']).rows.map(r=>({id:cleanText_(r[0]),date:r[1],bank:cleanText_(r[2]),reference:cleanText_(r[3]),type:cleanText_(r[4]),amount:Number(r[5]||0),note:cleanText_(r[6]),by:cleanText_(r[7])}));const assets=bankFinanceRows_(FINANCE_LEDGER_SHEET_,['Finance ID','Company','Asset / Item','Agreement No','Purchase Date','Total Finance','Down Payment','Installment Amount','Due Day','Paid Amount','Balance','Status','Recorded By']).rows.map(r=>({id:cleanText_(r[0]),company:cleanText_(r[1]),asset:cleanText_(r[2]),agreement:cleanText_(r[3]),purchaseDate:r[4],total:Number(r[5]||0),downPayment:Number(r[6]||0),installment:Number(r[7]||0),dueDay:cleanText_(r[8]),paid:Number(r[9]||0),balance:Number(r[10]||0),status:cleanText_(r[11])||'ACTIVE',by:cleanText_(r[12])}));const payments=bankFinanceRows_(FINANCE_PAYMENT_SHEET_,['Payment ID','Finance ID','Date','Amount','Reference','Recorded By']).rows.map(r=>({id:cleanText_(r[0]),financeId:cleanText_(r[1]),date:r[2],amount:Number(r[3]||0),reference:cleanText_(r[4]),by:cleanText_(r[5])}));return {banks:banks,finances:finances,bankTransactions:bank.reverse(),financeAssets:assets.reverse(),financePayments:payments.reverse()};}
function manageInternalBankFinance(request){const actor=bankFinanceActor_(request&&request.actorPin),type=cleanText_(request&&request.type).toUpperCase(),action=cleanText_(request&&request.action).toUpperCase(),name=cleanText_(request&&request.name),oldName=cleanText_(request&&request.oldName),key=type==='BANK_ACCOUNT'?'SHOP_BANK_ACCOUNTS':type==='FINANCE_COMPANY'?'SHOP_FINANCE_COMPANIES':'';if(!key)throw new Error('Invalid internal record type.');if(!['ADD','RENAME','DELETE'].includes(action))throw new Error('Invalid action.');if((action==='ADD'||action==='RENAME')&&!name)throw new Error('Enter a name.');if((action==='RENAME'||action==='DELETE')&&!oldName)throw new Error('Select a saved item.');return withLock_(function(){const ss=getSpreadsheet_(),settings=getSettings_(ss),items=paymentOptionList_(settings,key,[]),index=items.findIndex(function(value){return value.toLowerCase()===oldName.toLowerCase();});if(action==='ADD'){if(items.some(function(value){return value.toLowerCase()===name.toLowerCase();}))throw new Error('This name already exists.');items.push(name);}else if(index<0)throw new Error('Saved item not found.');else if(action==='RENAME'){if(items.some(function(value,i){return i!==index&&value.toLowerCase()===name.toLowerCase();}))throw new Error('This name already exists.');items[index]=name;}else items.splice(index,1);setSetting_(ss,key,JSON.stringify(items));return{type:type,action:action,items:items};});}
function saveBankLedgerTransaction(request){const actor=bankFinanceActor_(request&&request.actorPin),r=request||{},bank=cleanText_(r.bank),type=cleanText_(r.type),amount=Number(r.amount||0);if(!bank||!type||!isFinite(amount)||amount<=0)throw new Error('Select a bank, transaction type, and valid amount.');const id='BNK-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),row=[id,r.date?new Date(r.date):new Date(),bank,cleanText_(r.reference),type,amount,cleanText_(r.note),actor.name];const sh=bankFinanceRows_(BANK_LEDGER_SHEET_,['Transaction ID','Date','Bank','Account / Reference','Type','Amount','Note','Recorded By']).sheet;sh.appendRow(row);return {id:id};}
function saveFinanceAsset(request){const actor=bankFinanceActor_(request&&request.actorPin),r=request||{},company=cleanText_(r.company),asset=cleanText_(r.asset),total=Number(r.total||0),down=Math.max(0,Number(r.downPayment||0)),installment=Math.max(0,Number(r.installment||0));if(!company||!asset||!isFinite(total)||total<=0)throw new Error('Select a finance company, asset/item, and total finance amount.');const id='FIN-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),balance=Math.max(0,total-down),row=[id,company,asset,cleanText_(r.agreement),r.purchaseDate?new Date(r.purchaseDate):new Date(),total,down,installment,cleanText_(r.dueDay),0,balance,'ACTIVE',actor.name];const sh=bankFinanceRows_(FINANCE_LEDGER_SHEET_,['Finance ID','Company','Asset / Item','Agreement No','Purchase Date','Total Finance','Down Payment','Installment Amount','Due Day','Paid Amount','Balance','Status','Recorded By']).sheet;sh.appendRow(row);return {id:id};}
function saveFinanceInstallment(request){const actor=bankFinanceActor_(request&&request.actorPin),r=request||{},id=cleanText_(r.financeId),amount=Number(r.amount||0);if(!id||!isFinite(amount)||amount<=0)throw new Error('Select a finance record and valid payment amount.');const data=bankFinanceRows_(FINANCE_LEDGER_SHEET_,['Finance ID','Company','Asset / Item','Agreement No','Purchase Date','Total Finance','Down Payment','Installment Amount','Due Day','Paid Amount','Balance','Status','Recorded By']),index=data.rows.findIndex(row=>cleanText_(row[0])===id);if(index<0)throw new Error('Finance record not found.');const row=data.rows[index],balance=Number(row[10]||0);if(amount>balance)throw new Error('Payment cannot exceed the remaining balance.');row[9]=Number(row[9]||0)+amount;row[10]=Math.max(0,balance-amount);if(row[10]===0)row[11]='PAID';data.sheet.getRange(index+2,1,1,row.length).setValues([row]);const receipt='FNP-'+AppUtilities.getUuid().slice(0,8).toUpperCase();bankFinanceRows_(FINANCE_PAYMENT_SHEET_,['Payment ID','Finance ID','Date','Amount','Reference','Recorded By']).sheet.appendRow([receipt,id,new Date(),amount,cleanText_(r.reference),actor.name]);return {id:receipt,balance:row[10]};}

/* Digital-bill services follow the requested Manager -> Super Admin -> Master Owner chain. */
const DIGITAL_BILL_REQUESTS_SHEET_='Digital Bill Service Requests';
function digitalBillActor_(pin){const actor=accountForPin_(pin);if(!actor)throw new Error('Please log in again.');return actor;}
function getDigitalBillServiceStatus(actorPin){digitalBillActor_(actorPin);const s=getSettings_(getSpreadsheet_());return{email:s.EBILL_ENABLED==='YES',whatsapp:s.WHATSAPP_BILL_ENABLED==='YES'};}
function sendEbillEmail(request){
  digitalBillActor_(request&&request.actorPin);
  const email=cleanText_(request&&request.email),type=cleanText_(request&&request.type).toUpperCase(),number=cleanText_(request&&request.number);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid customer email address.');
  const settings=getSettings_(getSpreadsheet_());if(settings.EBILL_ENABLED!=='YES')throw new Error('E-Bill service has not been approved yet.');
  let record;if(type==='INVOICE')record=findInvoice(number);else if(type==='PAYMENT')record=findPayment(number);else record=findBill(number);
  const billNo=cleanText_(record.invoiceNo||record.billNo||number),currency=cleanText_(settings.CURRENCY)||'Rs.',total=Number(record.total||0).toFixed(2),business=cleanText_(settings.BUSINESS_NAME)||'SHAN POS';
  const body=business+'\n\nE-Bill / Receipt No: '+billNo+'\nDate: '+new Date(record.date||new Date()).toLocaleString()+'\nTotal: '+currency+' '+total+'\n\nThank you.';
  AppMail.sendEmail({to:email,subject:business+' E-Bill '+billNo,body:body,name:business});
  return{sent:true,email:email,billNo:billNo};
}
function submitDigitalBillServiceRequest(request){const actor=digitalBillActor_(request&&request.actorPin),service=cleanText_(request&&request.service).toUpperCase();if(!['EMAIL','WHATSAPP'].includes(service))throw new Error('Choose Email Bill or WhatsApp Bill.');return withLock_(function(){const sh=getOrCreateSheet_(getSpreadsheet_(),DIGITAL_BILL_REQUESTS_SHEET_);ensureHeaders_(sh,['Request ID','Requested At','Requested By','Role','Service','Status','Last Action By','Updated At']);const id='DBR-'+AppUtilities.getUuid().slice(0,8).toUpperCase();sh.appendRow([id,new Date(),actor.name,actor.role,service,'PENDING_MANAGER','',new Date()]);return{id:id,status:'PENDING_MANAGER'};});}
function listDigitalBillServiceRequests(actorPin){const actor=digitalBillActor_(actorPin),sh=getSpreadsheet_().getSheetByName(DIGITAL_BILL_REQUESTS_SHEET_);if(!sh||sh.getLastRow()<2)return[];const status=actor.role==='MANAGER'?'PENDING_MANAGER':actor.role==='SUPER_ADMIN'?'PENDING_SUPER_ADMIN':actor.role==='OWNER'?'PENDING_MASTER_OWNER':'';if(!status)return[];return sh.getDataRange().getValues().slice(1).map((r,i)=>({row:i+2,id:cleanText_(r[0]),requestedAt:r[1],requestedBy:cleanText_(r[2]),role:cleanText_(r[3]),service:cleanText_(r[4]),status:cleanText_(r[5])})).filter(r=>r.status===status);}
function decideDigitalBillServiceRequest(request){const actor=digitalBillActor_(request&&request.actorPin),id=cleanText_(request&&request.id),approved=request&&request.approved===true;return withLock_(function(){const sh=getSpreadsheet_().getSheetByName(DIGITAL_BILL_REQUESTS_SHEET_);if(!sh)throw new Error('Request not found.');const rows=sh.getDataRange().getValues(),index=rows.slice(1).findIndex(r=>cleanText_(r[0])===id);if(index<0)throw new Error('Request not found.');const row=rows[index+1],status=cleanText_(row[5]);let next='';if(actor.role==='MANAGER'&&status==='PENDING_MANAGER')next=approved?'PENDING_SUPER_ADMIN':'REJECTED';else if(actor.role==='SUPER_ADMIN'&&status==='PENDING_SUPER_ADMIN')next=approved?'PENDING_MASTER_OWNER':'REJECTED';else if(actor.role==='OWNER'&&status==='PENDING_MASTER_OWNER'){next=approved?'APPROVED':'REJECTED';if(approved)setSetting_(getSpreadsheet_(),row[4]==='EMAIL'?'EBILL_ENABLED':'WHATSAPP_BILL_ENABLED','YES');}else throw new Error('This request is not waiting for your approval.');sh.getRange(index+2,6,1,3).setValues([[next,actor.name,new Date()]]);return{status:next};});}

function findPayment(query) {
  const receiptNo = cleanText_(query).toUpperCase();
  if (!receiptNo) throw new Error('Enter a payment receipt number.');
  const ss = getSpreadsheet_();
  const settings = getSettings_(ss);
  const payments = ss.getSheetByName(APP.SHEETS.PAYMENTS);
  if (!payments || payments.getLastRow() < 2) throw new Error('No payment receipts have been saved yet.');
  const row = payments.getDataRange().getValues().slice(1).find(function (r) {
    return String(r[0]).toUpperCase() === receiptNo;
  });
  if (!row) throw new Error('Payment receipt not found: ' + receiptNo);
  return paymentReceiptFromRow_(row, settings);
}

function updateProductDetails(request) {
  requireAdminPin_(request && request.adminPin);
  if (!request) throw new Error('Item details are required.');
  const target = cleanText_(request.target);
  if (target !== APP.SHEETS.STOCK && target !== APP.SHEETS.INVOICE_STOCK) throw new Error('Invalid stock location.');
  const id = cleanText_(request.id);
  const name = cleanText_(request.name);
  if (!id) throw new Error('Select an item.');
  if (!name) throw new Error('Enter the item / service name.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheet_(ss, target);
    ensureHeaders_(sheet, ['Item ID','Item Name','Cost Price','Selling Price','Stock Qty','Track Stock','Status','Category','Warranty Period','Serial Number','Barcode']);
    const rows = sheet.getDataRange().getValues();
    const index = rows.slice(1).findIndex(function (row) { return cleanText_(row[0]).toUpperCase() === id.toUpperCase(); });
    if (index < 0) throw new Error('Item not found.');
    const rowNumber = index + 2;
    sheet.getRange(rowNumber, 2).setValue(name);
    if (request.category !== undefined) sheet.getRange(rowNumber, 8).setValue(cleanText_(request.category));
    if (target === APP.SHEETS.INVOICE_STOCK) {
      sheet.getRange(rowNumber, 9).setValue(cleanText_(request.warranty));
      sheet.getRange(rowNumber, 10).setValue(cleanText_(request.serial));
    }
    return { id: id, name: name };
  });
}

/** Saves or replaces an optional barcode for an existing item. Barcode is not compulsory. */
function updateProductBarcode(request) {
  requireAdminPin_(request && request.adminPin);
  if (!request) throw new Error('Item details are required.');
  const target = cleanText_(request.target);
  if (target !== APP.SHEETS.STOCK && target !== APP.SHEETS.INVOICE_STOCK) throw new Error('Invalid stock location.');
  const id = cleanText_(request.id);
  const barcode = cleanText_(request.barcode);
  if (!id) throw new Error('Select an item.');
  if (!barcode) throw new Error('Enter or generate a barcode.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getSheet_(ss, target);
    ensureHeaders_(sheet, ['Item ID','Item Name','Cost Price','Selling Price','Stock Qty','Track Stock','Status','Category','Warranty Period','Serial Number','Barcode']);
    const rows = sheet.getDataRange().getValues();
    const index = rows.slice(1).findIndex(function (row) { return cleanText_(row[0]).toUpperCase() === id.toUpperCase(); });
    if (index < 0) throw new Error('Item not found.');
    const duplicate = rows.slice(1).findIndex(function (row) { return cleanText_(row[0]).toUpperCase() !== id.toUpperCase() && cleanText_(row[10]).toUpperCase() === barcode.toUpperCase(); });
    if (duplicate >= 0) throw new Error('This barcode is already used by another item.');
    sheet.getRange(index + 2, 11).setValue(barcode);
    return { id: id, name: cleanText_(rows[index + 1][1]), barcode: barcode, target: target };
  });
}

/** Removes an item from all active product lists but keeps past bills intact. */
function retireProduct(request) {
  requireAdminPin_(request && request.adminPin);
  const target = cleanText_(request && request.target), id = cleanText_(request && request.id);
  if (target !== APP.SHEETS.STOCK && target !== APP.SHEETS.INVOICE_STOCK) throw new Error('Invalid stock location.');
  if (!id) throw new Error('Select an item.');
  return withLock_(function () {
    const sheet = getSheet_(getSpreadsheet_(), target), rows = sheet.getDataRange().getValues();
    const index = rows.slice(1).findIndex(function (row) { return cleanText_(row[0]).toUpperCase() === id.toUpperCase(); });
    if (index < 0) throw new Error('Item not found.');
    sheet.getRange(index + 2, 7).setValue('NO');
    return { id:id, name:cleanText_(rows[index + 1][1]), status:'REMOVED' };
  });
}

function getCustomers() { return getCustomers_(); }

function saveCustomer(request) {
  if (!request) throw new Error('Customer details are required.');
  const name = cleanText_(request.name), phone = cleanText_(request.phone), address = cleanText_(request.address);
  if (!name && !phone) throw new Error('Enter customer name or phone.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const sheet = getOrCreateSheet_(ss, APP.SHEETS.CUSTOMERS);
    ensureHeaders_(sheet, customerHeaders_());
    const rows = sheet.getDataRange().getValues();
    const requestId = cleanText_(request.id);
    const key = phone ? phone.replace(/\s+/g, '') : name.toUpperCase();
    let index = rows.slice(1).findIndex(function (r) {
      return (requestId && cleanText_(r[0]) === requestId) || (phone && cleanText_(r[2]).replace(/\s+/g, '') === key);
    });
    const id = index >= 0 ? cleanText_(rows[index + 1][0]) : 'cust-' + AppUtilities.getUuid();
    const values = [id, name || phone, phone, address, cleanText_(request.email), cleanText_(request.notes), new Date()];
    if (index >= 0) sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return customerFromRow_(values);
  });
}

function deleteCustomer(request) {
  requireAdminPin_(request && request.adminPin);
  const id = cleanText_(request && request.id);
  if (!id) throw new Error('Select a customer.');
  return withLock_(function () {
    const sheet = getOrCreateSheet_(getSpreadsheet_(), APP.SHEETS.CUSTOMERS);
    ensureHeaders_(sheet, customerHeaders_());
    const rows = sheet.getDataRange().getValues();
    const index = rows.slice(1).findIndex(function (r) { return cleanText_(r[0]) === id; });
    if (index < 0) throw new Error('Customer not found.');
    sheet.getRange(index + 2, 1, 1, customerHeaders_().length).setValues([['', '', '', '', '', 'Deleted', new Date()]]);
    return { id: id };
  });
}

// Account access is deliberately stored separately from shop data.  On a new
// installation there is only one account: Software Owner, username shan08, PIN 8888.  Every other
// account must be created by its direct parent role.
const POS_PERMISSION_KEYS_ = Object.freeze(['sale','reprint','payment','invoice','quotation','jobNotes','jobNoteSetup','demoMode','loans','cctvPackage','restaurant','mobileService','stockLookup','bankFinance','returns','purchase','reports','products','stockQuantity','stockOrder','stockNewBill','stockInvoice','branchView','backupImport','companyDetails','settings','tools','manageAccounts']);
const POS_NON_DELEGABLE_PERMISSIONS_ = Object.freeze(['companyDetails']);
// Dashboard and profile modules can be shown or hidden for each operational role.
// This is intentionally separate from action permissions: hiding a module does not
// silently grant an action that the account's own permissions do not allow.
const POS_MODULE_KEYS_ = Object.freeze(['sale','payment','invoice','quotation','jobNotes','loans','cctvPackage','restaurant','mobileService','billHistory','stock','paymentSetup','purchases','reports','overdueCredit','settings','tools']);
const POS_MODULE_ROLES_ = Object.freeze(['OWNER','SYSTEM_ADMIN','SUPER_ADMIN','ADMIN','AREA_MANAGER','SUPERVISOR','MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT']);
// Super Admin may create every operational account directly.  Admin may also
// create operational accounts, but there is intentionally no delete endpoint.
// Operational accounts cannot create, delete, enable, disable, or change
// permissions for other accounts.  Those controls belong to Super Admin only.
// Only the Master Owner may generate accounts. Super Admin can manage the
// permitted operational PINs, but cannot create a new account.
const POS_ROLE_CHILDREN_ = Object.freeze({OWNER:['SYSTEM_ADMIN','SUPER_ADMIN','ADMIN','AREA_MANAGER','SUPERVISOR','MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT','DEMO'],SYSTEM_ADMIN:['SUPER_ADMIN','ADMIN','AREA_MANAGER','SUPERVISOR','MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT'],SUPER_ADMIN:['ADMIN','AREA_MANAGER','SUPERVISOR','MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT'],ADMIN:['AREA_MANAGER','SUPERVISOR','MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT'],AREA_MANAGER:['BRANCH_MANAGER','CASHIER','USER','SUPPORT'],SUPERVISOR:['CASHIER','USER','SUPPORT'],MANAGER:['AREA_MANAGER','BRANCH_MANAGER','CASHIER','USER','SUPPORT'],BRANCH_MANAGER:['CASHIER','USER','SUPPORT'],CASHIER:[],USER:[],SUPPORT:[],DEMO:[]});
const POS_ACCESS_DEFAULTS_ = Object.freeze({
  version: 3,
  moduleVisibility: {OWNER:{},SYSTEM_ADMIN:{},SUPER_ADMIN:{},ADMIN:{},SUPERVISOR:{},MANAGER:{},BRANCH_MANAGER:{},CASHIER:{},USER:{},SUPPORT:{}},
  accounts: [{id:'owner',name:'shan08',role:'OWNER',pinHash:'2926a2731f4b312c08982cacf8061eb14bf65c1a87cc5d70e864e079c6220731',parentId:'',active:true,permissions:{sale:true,reprint:true,payment:true,invoice:true,quotation:true,jobNotes:true,returns:true,purchase:true,reports:true,products:true,settings:true,tools:true,manageAccounts:true}}]
});
const POS_SUPER_ADMIN_SHOP_CODE_ = 'SHPS0001';
const POS_MASTER_PIN_RESET_FLAG_ = 'POS_MASTER_PIN_RESET_V15_DONE';
const POS_MASTER_PIN_MIGRATION_FLAG_ = 'POS_MASTER_PIN_MIGRATION_V16_DONE';
const POS_SHOP_ACCESS_DEFAULTS_ = Object.freeze({version:3,moduleVisibility:{OWNER:{},SYSTEM_ADMIN:{},SUPER_ADMIN:{},ADMIN:{},SUPERVISOR:{},MANAGER:{},BRANCH_MANAGER:{},CASHIER:{},USER:{},SUPPORT:{}},accounts:[{id:'shop-admin',name:'Shop Admin',role:'ADMIN',pinHash:'0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',parentId:'',active:true,permissions:{sale:true,reprint:true,payment:true,invoice:true,quotation:true,jobNotes:true,returns:true,purchase:true,reports:true,products:true,settings:true,tools:false,manageAccounts:false}}]});
const POS_PERSONAL_SHOP_ACCESS_DEFAULTS_ = Object.freeze({version:3,moduleVisibility:{OWNER:{},SYSTEM_ADMIN:{},SUPER_ADMIN:{},ADMIN:{},SUPERVISOR:{},MANAGER:{},BRANCH_MANAGER:{},CASHIER:{},USER:{},SUPPORT:{}},accounts:[{id:'super-admin',name:'Super Admin',role:'SUPER_ADMIN',pinHash:'0ffe1abd1a08215353c233d6e009613e95eec4253832a761af28ff37ac5a150c',parentId:'',active:true,permissions:{sale:true,reprint:true,payment:true,invoice:true,quotation:true,jobNotes:true,returns:true,purchase:true,reports:true,products:true,settings:true,tools:true,manageAccounts:true}}]});

function pinHash_(pin) {
  const bytes = AppUtilities.computeDigest(AppUtilities.DigestAlgorithm.SHA_256, String(pin), AppUtilities.Charset.UTF_8);
  return bytes.map(function (byte) { const value = (byte + 256) % 256; return ('0' + value.toString(16)).slice(-2); }).join('');
}
function isTopRole_(role){return role==='OWNER'||role==='SUPER_ADMIN';}
function branchReadAllowedForBusinessMode_(mode){return ['PARTNERSHIP','PRIVATE_COMPANY','PUBLIC_LIMITED','ORGANIZATION','COOPERATIVE','SOCIETY_ASSOCIATION','TRUST_NGO','OTHER'].includes(cleanText_(mode).toUpperCase());}
function defaultAllowedShopRoles_(mode){return branchReadAllowedForBusinessMode_(mode)?['SUPER_ADMIN','SYSTEM_ADMIN','ADMIN','AREA_MANAGER','MANAGER','BRANCH_MANAGER','SUPERVISOR','CASHIER','USER','SUPPORT']:['SUPER_ADMIN','ADMIN','MANAGER','SUPERVISOR','CASHIER','USER','SUPPORT'];}
function normaliseAllowedShopRoles_(roles,mode){const valid=['SUPER_ADMIN','SYSTEM_ADMIN','ADMIN','AREA_MANAGER','MANAGER','BRANCH_MANAGER','SUPERVISOR','CASHIER','USER','SUPPORT'];const submitted=Array.isArray(roles)?roles.map(function(r){return cleanText_(r).toUpperCase();}).filter(function(r){return valid.indexOf(r)>=0;}):[];const base=submitted.length?submitted:defaultAllowedShopRoles_(mode),out=[];base.forEach(function(r){if(out.indexOf(r)<0)out.push(r);});if(out.indexOf('SUPER_ADMIN')<0)out.unshift('SUPER_ADMIN');return out;}
function activeShopAllowedRoles_(){const shop=activeShopCode_();if(!shop)return null;const record=shopDatabaseConfig_()[shop]||{};return normaliseAllowedShopRoles_(record.allowedRoles,(record.customerDetails||{}).businessType);}
function requireAdminPin_(pin) {
  const account = accountForPin_(pin);
  if (!account || !(account.role === 'SUPER_ADMIN' || account.permissions.products || account.permissions.stockNewBill || account.permissions.stockInvoice || account.permissions.returns || account.permissions.tools)) throw new Error('You do not have permission for this action.');
}
function requireReturnApprovalPin_(pin) {
  const account = accountForPin_(pin);
  const permissions = account && (account.role === 'OWNER' ? allPermissions_() : account.role === 'SUPER_ADMIN' ? superAdminPermissions_(account) : account.permissions || {});
  const role = account && cleanText_(account.role).toUpperCase();
  const managementRoles = ['OWNER','SUPER_ADMIN','ADMIN','MANAGER','SUPERVISOR','BRANCH_MANAGER'];
  if (!account || managementRoles.indexOf(role) < 0 || permissions.returns !== true) throw new Error('Return requires approval from higher management with Returns permission.');
  return account;
}
function requireCompanyDetailsEditor_(pin) {
  const account=accountForPin_(pin), permissions=account && (account.role==='OWNER'?allPermissions_():account.role==='SUPER_ADMIN'?superAdminPermissions_(account):account.permissions||{});
  if(!activeShopCode_() || !account || !['ADMIN','SUPER_ADMIN'].includes(account.role) || permissions.companyDetails!==true) throw new Error('Only the current Shop account with Shop Details Edit permission can change its own shop information.');
  return account;
}
function companySettingsAccess_(pin) {
  const account=accountForPin_(pin), permissions=account && (account.role==='OWNER'?allPermissions_():account.role==='SUPER_ADMIN'?superAdminPermissions_(account):account.permissions||{});
  if(!account || !permissions || (permissions.settings!==true && permissions.companyDetails!==true)) throw new Error('You do not have permission to view shop settings.');
  return {account:account,permissions:permissions,identity:!!(activeShopCode_()&&['ADMIN','SUPER_ADMIN'].includes(account.role)&&permissions.companyDetails===true)};
}
function requirePermission_(pin, key) {
  const account = accountForPin_(pin);
  const permissions = account && (account.role === 'OWNER' ? allPermissions_() : account.role === 'SUPER_ADMIN' ? superAdminPermissions_(account) : account.permissions || {});
  if (!account || !permissions || permissions[key] !== true) throw new Error('You do not have permission for this action.');
  return account;
}
function posAccessConfig_() {
  const properties = AppProperties.getScriptProperties();
  const shopForConfig = activeShopCode_();
  if (shopForConfig) assertShopLinkActive_(shopForConfig);
  const propertyKey=posAccessConfigPropertyKey_(),stored=properties.getProperty(propertyKey);
  if (stored) { try {
    const parsed = JSON.parse(stored);
    if (parsed && Array.isArray(parsed.accounts)) {
      let changed=false;
      const currentShop=activeShopCode_();
      if(currentShop&&parsed.accounts.length===1&&parsed.accounts[0].id==='super-admin'&&parsed.accounts[0].role==='SUPER_ADMIN'){parsed.accounts[0]=JSON.parse(JSON.stringify(POS_SHOP_ACCESS_DEFAULTS_.accounts[0]));changed=true;}
      if(!activeShopCode_()&&!parsed.accounts.some(a=>a.role==='OWNER')){const legacy=parsed.accounts.length===1&&parsed.accounts[0].id==='super-admin'&&parsed.accounts[0].role==='SUPER_ADMIN'?parsed.accounts[0]:null;if(legacy){legacy.id='owner';legacy.name='shan08';legacy.role='OWNER';legacy.parentId='';changed=true;}else{parsed.accounts.unshift(JSON.parse(JSON.stringify(POS_ACCESS_DEFAULTS_.accounts[0])));changed=true;}}
      if(!activeShopCode_()){const owner=parsed.accounts.find(a=>a.role==='OWNER');if(owner&&cleanText_(owner.name).toLowerCase()==='master owner'){owner.name='shan08';changed=true;}}
      // Never silently replace the Software Owner's PIN.  Older builds changed
      // it to 9999 during migration, which locked the owner out after deploy.
      // Migrate only that known legacy state back to the documented default.
      if(!activeShopCode_()&&properties.getProperty(POS_MASTER_PIN_MIGRATION_FLAG_)!=='done'){const owner=parsed.accounts.find(a=>a.role==='OWNER');if(owner&&owner.pinHash===pinHash_('9999')){owner.pinHash=pinHash_('8888');owner.active=true;changed=true;}properties.setProperty(POS_MASTER_PIN_MIGRATION_FLAG_,'done');}
      if (!parsed.moduleVisibility) parsed.moduleVisibility = {};
      parsed.accounts.forEach(function (account) {
        if (!account.permissions) account.permissions = {};
        if (account.role === 'OWNER' && account.permissions.jobNotes === undefined) { account.permissions.jobNotes = true; changed = true; }
        if (currentShop && account.id === 'shop-admin' && account.permissions.jobNotes === undefined) { account.permissions.jobNotes = true; changed = true; }
        if (account.role === 'SUPER_ADMIN' && account.permissions.jobNotes === undefined) { account.permissions.jobNotes = true; changed = true; }
      });
      POS_MODULE_ROLES_.forEach(function (role) {
        if (!parsed.moduleVisibility[role]) parsed.moduleVisibility[role] = {};
        POS_MODULE_KEYS_.forEach(function (key) {
          if (parsed.moduleVisibility[role][key] === undefined) parsed.moduleVisibility[role][key] = true;
        });
      });
      if (parsed.version !== 3) { parsed.version = 3; changed=true; }
      if(changed)properties.setProperty(propertyKey,JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {} }
  const shop=activeShopCode_(),defaults=!shop?POS_ACCESS_DEFAULTS_:POS_SHOP_ACCESS_DEFAULTS_;
  const config = JSON.parse(JSON.stringify(defaults));
  if (shop) {
    const shopRecord=shopDatabaseConfig_()[shop],configuredPermissions=shopRecord&&shopRecord.adminPermissions&&typeof shopRecord.adminPermissions==='object'?permissionsForConfiguredShop_(shopRecord.adminPermissions):null,account=config.accounts[0];
    if(account&&shopRecord){account.role=cleanText_(shopRecord.initialRole).toUpperCase()||'ADMIN';account.name=cleanText_(shopRecord.initialUsername)||account.role.replace('_',' ');account.id='shop-admin';account.masterLocked=true;account.pinHash=shopRecord.initialPinHash||account.pinHash;account.permissions=configuredPermissions||account.permissions;if(account.role==='SYSTEM_ADMIN')account.permissions.manageAccounts=true;account.demoExpiresAt=shopRecord.demoMode?cleanText_(shopRecord.demoExpiresAt):'';}
  }
  POS_MODULE_ROLES_.forEach(function (role) { if(!config.moduleVisibility[role]) config.moduleVisibility[role] = {}; POS_MODULE_KEYS_.forEach(function (key) { config.moduleVisibility[role][key] = true; }); });
  properties.setProperty(propertyKey, JSON.stringify(config));
  return config;
}
function posAccessConfigPropertyKey_(){const shop=activeShopCode_();return shop?'POS_ACCESS_CONFIG_SHOP_'+shop:'POS_ACCESS_CONFIG';}
function saveAccessConfig_(config) { AppProperties.getScriptProperties().setProperty(posAccessConfigPropertyKey_(), JSON.stringify(config)); }
function masterOwnerAccountForPin_(pin){const raw=AppProperties.getScriptProperties().getProperty('POS_ACCESS_CONFIG');let accounts=POS_ACCESS_DEFAULTS_.accounts;try{const parsed=JSON.parse(raw||'');if(parsed&&Array.isArray(parsed.accounts))accounts=parsed.accounts;}catch(e){}const hash=pinHash_(cleanText_(pin));return accounts.find(a=>a.role==='OWNER'&&a.active!==false&&a.pinHash===hash)||null;}
function requestPinValue_(request){return cleanText_(request&&typeof request==='object'?request.pin:request);}
function requestTokenValue_(request){return cleanText_(request&&typeof request==='object'?request.token:request);}
function requestShopValue_(request){return normaliseShopCode_(request&&typeof request==='object'?request.shopCode:'');}
function explicitShopContext_(request){return !!(request&&typeof request==='object'&&Object.prototype.hasOwnProperty.call(request,'shopCode'));}
function activateShopForAppSession_(session, token){const shop=normaliseShopCode_(session&&session.shopCode);if(shop)assertShopLinkActive_(shop,token);setActiveShop_(shop);return shop;}
function setShopContextFromRequest_(request){if(request&&typeof request==='object'){let shop=requestShopValue_(request);if(shop){const rec=shopRecordForCode_(shop);if(rec){const key=Object.keys(shopDatabaseConfig_()).find(k=>shopDatabaseConfig_()[k]===rec);shop=key||shop;}assertShopLinkActive_(shop);setActiveShop_(shop);return shop;}if(explicitShopContext_(request)){setActiveShop_('');return '';}const token=cleanText_(request.actorPin||request.token);const session=posAppSessionForToken_(token);if(session)return activateShopForAppSession_(session,token);}return activeShopCode_();}
function allPermissions_() { const out={}; POS_PERMISSION_KEYS_.forEach(k=>out[k]=true); return out; }
function superAdminPermissions_(account) {
  const assigned = account && account.permissions && Object.keys(account.permissions).length ? account.permissions : allPermissions_();
  const out = {};
  POS_PERMISSION_KEYS_.forEach(function (key) { out[key] = assigned[key] === true; });
  out.manageAccounts = true;
  return out;
}
function permissionsForConfiguredShop_(requested) {
  const out = {};
  POS_PERMISSION_KEYS_.forEach(function (key) { out[key] = requested[key] === true; });
  return out;
}
function accountForPin_(pin) {
  const value = cleanText_(pin&&typeof pin==='object'?(pin.token||pin.actorPin||pin.pin):pin);
  if (value.indexOf('pos-session:') === 0) {
    const session = posAppSessionForToken_(value);
    if(session)activateShopForAppSession_(session,value);
    if (session) { const account=posAccessConfig_().accounts.find(a=>a.id===session.accountId&&a.active!==false)||null; if(account&&account.demoExpiresAt&&new Date(account.demoExpiresAt).getTime()<=Date.now())return null; return account; }
  }
  const hash=pinHash_(value); return posAccessConfig_().accounts.find(a=>a.active!==false&&(!a.demoExpiresAt||new Date(a.demoExpiresAt).getTime()>Date.now())&&a.pinHash===hash) || null;
}
function publicAccount_(a) { return {id:a.id,name:a.name,role:a.role,parentId:a.parentId||'',permissions:a.permissions||{},active:a.active!==false,profilePhotoUrl:logoDataUrl_((a.profilePreferences||{}).profilePhotoUrl||'')}; }
/** Personal settings only. It does not alter permissions or business data. */
function updateMyProfile(request) {
  // Profile requests can arrive independently of login. Restore the shop
  // context first so a customer-shop user updates its own account record.
  setShopContextFromRequest_(request);
  const actor=accountForPin_(request&&request.actorPin),username=cleanText_(request&&request.username),newPin=cleanText_(request&&request.newPin),tileStyle=cleanText_(request&&request.tileStyle).toUpperCase(),profilePhotoDataUrl=cleanText_(request&&request.profilePhotoDataUrl);
  if(!actor)throw new Error('Please log in again.');
  if(!username)throw new Error('Enter a username.');
  if(username.length>60)throw new Error('Username is too long.');
  if(tileStyle&&['COMPACT','COMFORTABLE'].indexOf(tileStyle)<0)throw new Error('Choose a valid tile display style.');
  if(newPin&&!/^\d{4,6}$/.test(newPin))throw new Error('PIN must be 4 to 6 digits.');
  if(activeShopCode_()&&actor.masterLocked&&!actor.firstLoginCompleted&&(!newPin||username.toLowerCase()===cleanText_(actor.name).toLowerCase()))throw new Error('First login setup is required: choose your own username and PIN.');
  return withLock_(function(){const config=posAccessConfig_(),account=config.accounts.find(function(item){return item.id===actor.id&&item.active!==false;});if(!account)throw new Error('Account not found.');if(config.accounts.some(function(item){return item.id!==account.id&&cleanText_(item.name).toLowerCase()===username.toLowerCase();}))throw new Error('That username is already in use.');if(newPin&&config.accounts.some(function(item){return item.id!==account.id&&item.pinHash===pinHash_(newPin);}))throw new Error('Choose a PIN not used by another account.');account.name=username;if(newPin)account.pinHash=pinHash_(newPin);if(activeShopCode_()&&account.masterLocked)account.firstLoginCompleted=true;account.profilePreferences=account.profilePreferences||{};if(tileStyle)account.profilePreferences.tileStyle=tileStyle;if(profilePhotoDataUrl)account.profilePreferences.profilePhotoUrl=saveLogoFile_(profilePhotoDataUrl);saveAccessConfig_(config);return{id:account.id,name:account.name,tileStyle:account.profilePreferences.tileStyle||'COMFORTABLE',profilePhotoUrl:logoDataUrl_(account.profilePreferences.profilePhotoUrl||''),pinChanged:!!newPin};});
}
function descendantAccountIds_(accounts, parentId) {
  const ids={}, pending=[parentId];
  while(pending.length){const current=pending.shift();(accounts||[]).filter(function(account){return account.parentId===current;}).forEach(function(account){if(!ids[account.id]){ids[account.id]=true;pending.push(account.id);}});}
  return ids;
}
function permissionsForChild_(actor, requested, role) {
  const allowed=isTopRole_(actor.role)?allPermissions_():(actor.permissions||{}), out={};
  POS_PERMISSION_KEYS_.forEach(function(k){out[k]=k==='manageAccounts'||(POS_NON_DELEGABLE_PERMISSIONS_.includes(k)&&actor.role!=='OWNER')?false:allowed[k]===true&&requested[k]===true;});
  if(role==='SYSTEM_ADMIN'||role==='SUPER_ADMIN') out.manageAccounts=true;
  if(out.loans===true){out.settings=true;out.reports=true;out.reprint=true;out.manageAccounts=true;}
  return out;
}
/** Removing a permission from a parent also removes it from every lower account. */
function cascadePermissionsToChildren_(config, parentId, parentPermissions) {
  (config.accounts || []).filter(function (account) { return account.parentId === parentId; }).forEach(function (child) {
    const existing = child.permissions || {}, next = {};
    POS_PERMISSION_KEYS_.forEach(function (key) { next[key] = parentPermissions[key] === true && existing[key] === true; });
    child.permissions = next;
    cascadePermissionsToChildren_(config, child.id, next);
  });
}
function loginWithPin(request) {
  if(request&&typeof request==='object')setShopContextFromRequest_(request);
  const value = requestPinValue_(request);
  if (!/^\d{4,6}$/.test(value)) throw new Error('Enter a 4 to 6 digit PIN.');
  const account = accountForPin_(value);
  if (!account) throw new Error('Incorrect username or PIN.');
  const shop=activeShopCode_(), record=shop?shopRecordForCode_(shop):null, activationKey=cleanText_(request&&request.activationKey), supportCode=cleanText_(request&&request.supportCode);
  if(supportCode&&!shop&&(!account.supportCode||account.supportCode!==supportCode))throw new Error('This support login link does not match the selected support account.');
  if(shop){
    if(!record)throw new Error('This shop link has been deleted or disabled. Ask the Master Owner for a new link.');
    if(!record.demoMode){
      if(shopActivationKeyExpired_(record))throw new Error('This customer activation key has expired. Ask the Master Owner for a new key.');
      if(!activationKey)throw new Error('Enter the 4-part activation key from the Master Owner to activate this shop.');
      if(!shopActivationKeyMatches_(record, activationKey))throw new Error('Enter the correct 4-part activation key from the Master Owner.');
    }
  }
  const requestedUsername=cleanText_(request&&request.username).toLowerCase();
  if(requestedUsername&&requestedUsername!==cleanText_(account.name).toLowerCase()){
    const defaultLockedName=cleanText_(account.role).replace('_',' ').toLowerCase();
    if(shop&&account.masterLocked&&!cleanText_(record&&record.initialUsername)&&cleanText_(account.name).toLowerCase()===defaultLockedName){
      const config=posAccessConfig_(), target=config.accounts.find(function(item){return item.id===account.id;});
      if(target){target.name=cleanText_(request&&request.username);saveAccessConfig_(config);account.name=target.name;}
      const shops=shopDatabaseConfig_();if(shops[shop]){shops[shop].initialUsername=account.name;shops[shop].updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);}
    }else throw new Error('Incorrect username or PIN.');
  }
  return sessionPayloadForAccount_(account, createPosAppSession_(account));
}
function activateCustomerLicenseFromUi(request) {
  if (request && typeof request === 'object') setShopContextFromRequest_(request);
  const shop = activeShopCode_(), key = cleanText_(request && request.activationKey), pin = requestPinValue_(request);
  if (!shop) throw new Error('This activation screen is available only on a customer software link.');
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Enter your 4 to 6 digit PIN.');
  const actor=accountForPin_(pin);
  if (!actor) throw new Error('Incorrect PIN.');
  if (actor.role!=='SUPER_ADMIN') throw new Error('Only the Customer account owner can activate or re-license this software.');
  const record = shopRecordForCode_(shop);
  if (!record || record.demoMode) throw new Error('This shop is a Demo version and does not use a license key.');
  if (!key) throw new Error('Enter the license key received from the Master.');
  if (shopActivationKeyExpired_(record)) throw new Error('This license key has expired. Ask the Master for a new key.');
  if (!shopActivationKeyMatches_(record, key)) throw new Error('This license key does not belong to this customer software.');
  return { shopCode: shop, licenseTier: record.licenseTier || 'FIRST_PURCHASE', expiresAt: record.activationCodeExpiresAt || '', status: 'ACTIVE' };
}
function resumeLoginAppSession(request) {
  const token = requestTokenValue_(request), requestedShop=requestShopValue_(request);
  const session = posAppSessionForToken_(token);
  if (!session) throw new Error('Please log in again.');
  const sessionShop=normaliseShopCode_(session.shopCode);
  if(requestedShop&&sessionShop!==requestedShop)throw new Error('This login belongs to another shop link. Please log in again.');
  if(explicitShopContext_(request)&&!requestedShop&&sessionShop)throw new Error('This login belongs to a shop link. Please log in again.');
  activateShopForAppSession_(session,token);
  const account = posAccessConfig_().accounts.find(a=>a.id===session.accountId&&a.active!==false);
  if (!account) throw new Error('Please log in again.');
  return sessionPayloadForAccount_(account, token);
}
/** Returns the latest permissions for an already logged-in browser session.
 * This lets a Super Admin feature change take effect without waiting for the
 * affected account to close the browser or enter its PIN again. */
function refreshLoginAppSession(request) {
  const token = requestTokenValue_(request);
  const session = posAppSessionForToken_(token);
  if (!session) throw new Error('Please log in again.');
  activateShopForAppSession_(session,token);
  const account = posAccessConfig_().accounts.find(function (a) {
    return a.id === session.accountId && a.active !== false;
  });
  if (!account) throw new Error('This account has been disabled.');
  return sessionPayloadForAccount_(account, token);
}
function logoutLoginAppSession(request) {
  const value = requestTokenValue_(request);
  if (value.indexOf('pos-session:') === 0) AppCache.getScriptCache().remove(value);
  return true;
}
function moduleVisibilityForRole_(role) {
  const config = posAccessConfig_();
  const stored = (config.moduleVisibility || {})[role] || {};
  const out = {};
  POS_MODULE_KEYS_.forEach(function (key) { out[key] = (isTopRole_(role) || role === 'DEMO') ? true : stored[key] !== false; });
  return out;
}
function sessionPayloadForAccount_(account, token) {
  const permissions=account.role==='OWNER'?allPermissions_():account.role==='SUPER_ADMIN'?superAdminPermissions_(account):account.permissions||{};
  return { id:account.id, name:account.name, role:account.role, supportRole:account.supportRole||'', supportAuthority:account.supportAuthority||'', permissions:permissions, moduleVisibility:moduleVisibilityForRole_(account.role), profilePhotoUrl:logoDataUrl_((account.profilePreferences||{}).profilePhotoUrl||''), token:token, shopCode:activeShopCode_(), firstLoginRequired:!!(activeShopCode_()&&account.masterLocked&&!account.firstLoginCompleted) };
}
function createPosAppSession_(account) {
  const token = 'pos-session:' + AppUtilities.getUuid();
  AppCache.getScriptCache().put(token, JSON.stringify({ accountId: account.id, shopCode:activeShopCode_(), created: new Date().toISOString() }), 21600);
  return token;
}
function posAppSessionForToken_(token) {
  const value = cleanText_(token);
  if (value.indexOf('pos-session:') !== 0) return null;
  const raw = AppCache.getScriptCache().get(value);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function getAccessManagement(actorPin) {
  const actor=accountForPin_(actorPin); if(!actor) throw new Error('Please log in again.');
  const config=posAccessConfig_();let children=POS_ROLE_CHILDREN_[actor.role]||[];
  const allowed=activeShopAllowedRoles_();
  if(allowed)children=children.filter(function(role){return allowed.indexOf(role)>=0;});
  const visibleIds=isTopRole_(actor.role)?null:descendantAccountIds_(config.accounts,actor.id);
  return {actor:publicAccount_(actor), canCreate:children, permissionKeys:POS_PERMISSION_KEYS_, moduleKeys:POS_MODULE_KEYS_, moduleRoles:POS_MODULE_ROLES_, moduleVisibility:config.moduleVisibility||{}, accounts:config.accounts.filter(a=>isTopRole_(actor.role)?a.id!==actor.id:!!visibleIds[a.id]).map(publicAccount_)};
}
/** Only Super Admin decides which dashboard/profile modules each role can see. */
function updateModuleVisibility(request) {
  const actor = accountForPin_(request && request.actorPin);
  if (!actor || actor.role !== 'OWNER') throw new Error('Only the Master Owner can change module visibility.');
  const submitted = request && request.moduleVisibility;
  if (!submitted || typeof submitted !== 'object') throw new Error('Module visibility settings are required.');
  return withLock_(function () {
    const config = posAccessConfig_();
    if (!config.moduleVisibility) config.moduleVisibility = {};
    POS_MODULE_ROLES_.forEach(function (role) {
      if (!config.moduleVisibility[role]) config.moduleVisibility[role] = {};
      POS_MODULE_KEYS_.forEach(function (key) {
        const row = submitted[role] || {};
        if (Object.prototype.hasOwnProperty.call(row, key)) config.moduleVisibility[role][key] = row[key] === true;
        else if (config.moduleVisibility[role][key] === undefined) config.moduleVisibility[role][key] = true;
      });
    });
    config.version = 3;
    saveAccessConfig_(config);
    return config.moduleVisibility;
  });
}
function createManagedAccount(request) {
  const actor=accountForPin_(request&&request.actorPin), role=cleanText_(request&&request.role).toUpperCase(), pin=cleanText_(request&&request.pin), name=cleanText_(request&&request.name);
  if(!actor) throw new Error('Please log in again.');
  if(!(POS_ROLE_CHILDREN_[actor.role]||[]).includes(role)) throw new Error('Your role cannot create this account type.');
  if(role==='DEMO'&&(actor.role!=='OWNER'||activeShopCode_())) throw new Error('Demo version accounts can only be created by the Master Owner on the Master software.');
  if(!name) throw new Error('Enter an account name.'); if(!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4 to 6 digits.');
  return withLock_(function(){const config=posAccessConfig_(); if(role==='SUPER_ADMIN'&&!['OWNER','SYSTEM_ADMIN'].includes(actor.role)) throw new Error('Only the Software Owner or System Administrator can create a Super Admin account.'); if(role==='SUPER_ADMIN'&&!activeShopCode_()&&config.accounts.some(a=>a.role==='SUPER_ADMIN'&&a.active!==false)) throw new Error('Only one Super Admin account is allowed for the Master software.'); if(config.accounts.some(a=>a.pinHash===pinHash_(pin))) throw new Error('Choose a PIN not used by another account.'); const account={id:'acct-'+AppUtilities.getUuid(),name:name,role:role,pinHash:pinHash_(pin),parentId:actor.id,active:true,permissions:permissionsForChild_(actor,request.permissions||{},role)};if(role==='DEMO'){account.permissions=allPermissions_();account.permissions.manageAccounts=false;account.demoExpiresAt=new Date(Date.now()+15*86400000).toISOString();}config.accounts.push(account);saveAccessConfig_(config);const serviceUrl=RuntimeApp.getService().getUrl();return Object.assign(publicAccount_(account),{loginUrl:serviceUrl+(activeShopCode_()?'?shop='+encodeURIComponent(activeShopCode_()):''),demoExpiresAt:account.demoExpiresAt||''});});
}
const FEATURE_PERMISSION_REQUESTS_PROPERTY_ = 'POS_FEATURE_PERMISSION_REQUESTS';
function submitFeaturePermissionRequest(request) {
  const actor=accountForPin_(request&&request.actorPin), permission=cleanText_(request&&request.permission);
  if(!actor) throw new Error('Please log in again.');
  if(!POS_PERMISSION_KEYS_.includes(permission) || permission==='manageAccounts') throw new Error('Invalid permission request.');
  const effectivePermissions=actor.role==='SUPER_ADMIN'?superAdminPermissions_(actor):(actor.permissions||{});
  if(effectivePermissions[permission]===true) throw new Error('This permission is already enabled.');
  const shop=activeShopCode_(); if(!shop) throw new Error('Permission requests are available from a shop link.');
  return withLock_(function(){let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_)||'[]');}catch(e){rows=[];}const configRaw=AppProperties.getScriptProperties().getProperty('POS_ACCESS_CONFIG_SHOP_'+shop);let hasSuper=false;try{const config=JSON.parse(configRaw||'{}');hasSuper=(config.accounts||[]).some(function(account){return account.role==='SUPER_ADMIN'&&account.active!==false;});}catch(e){}const status=actor.role==='SUPER_ADMIN'||!hasSuper?'PENDING_MASTER':'PENDING_SUPER_ADMIN',existing=rows.find(r=>r.shopCode===shop&&r.requesterId===actor.id&&r.permission===permission&&r.status===status);if(existing)return existing;const shops=shopDatabaseConfig_(),record=shops[shop]||{};const item={id:'FPR-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),createdAt:new Date().toISOString(),shopCode:shop,shopName:cleanText_(record.shopName)||shop,requesterId:actor.id,requesterName:actor.name,requesterRole:actor.role,permission:permission,status:status};rows.push(item);AppProperties.getScriptProperties().setProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_,JSON.stringify(rows));return item;});
}
function listFeaturePermissionRequests(actorPin) {
  const actor=accountForPin_(actorPin); if(!actor||!isTopRole_(actor.role)) throw new Error('Only Master Owner or Super Admin can view permission requests.');
  let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_)||'[]');}catch(e){rows=[];}
  return rows.filter(function(row){return actor.role==='OWNER'?String(row.status||'').indexOf('PENDING_')===0:row.status==='PENDING_SUPER_ADMIN';});
}
function decideFeaturePermissionRequest(request) {
  const actor=accountForPin_(request&&request.actorPin), id=cleanText_(request&&request.id), approved=request&&request.approved===true;
  if(!actor||!['OWNER','SUPER_ADMIN'].includes(actor.role)) throw new Error('Only the Master Owner or Master Super Admin can approve permission requests.');
  return withLock_(function(){let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_)||'[]');}catch(e){rows=[];}const item=rows.find(function(row){return row.id===id&&(actor.role==='OWNER'?String(row.status||'').indexOf('PENDING_')===0:row.status==='PENDING_SUPER_ADMIN');});if(!item)throw new Error('Permission request not found.');if(approved){const key='POS_ACCESS_CONFIG_SHOP_'+item.shopCode,raw=AppProperties.getScriptProperties().getProperty(key);if(!raw)throw new Error('Shop account configuration not found.');const config=JSON.parse(raw),target=config.accounts.find(function(account){return account.id===item.requesterId;});if(!target)throw new Error('Requesting account not found.');target.permissions=target.permissions||{};target.permissions[item.permission]=true;saveShopAccessConfigByCode_(item.shopCode,config);if(actor.role==='OWNER'){const shops=shopDatabaseConfig_(),record=shops[normaliseShopCode_(item.shopCode)];if(record){record.adminPermissions=record.adminPermissions||{};record.adminPermissions[item.permission]=true;record.updatedAt=new Date().toISOString();saveShopDatabaseConfig_(shops);}}}item.status=approved?'APPROVED':'REJECTED';item.decidedAt=new Date().toISOString();item.decidedBy=actor.name;AppProperties.getScriptProperties().setProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_,JSON.stringify(rows));return item;});
}
function saveShopAccessConfigByCode_(shopCode, config) { AppProperties.getScriptProperties().setProperty('POS_ACCESS_CONFIG_SHOP_'+normaliseShopCode_(shopCode), JSON.stringify(config)); }
/** Changes only the feature permissions of an existing managed account. */
function updateManagedAccountPermissions(request) {
  const actor = accountForPin_(request && request.actorPin), targetId = cleanText_(request && request.targetId);
  if (!actor) throw new Error('Please log in again.');
  return withLock_(function () {
    const config = posAccessConfig_(), target = config.accounts.find(function (account) { return account.id === targetId; });
    if (!target) throw new Error('Account not found.');
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'OWNER') throw new Error('Only the Master Owner can change Super Admin permissions.');
    if (actor.role === 'SUPER_ADMIN' && target.role !== 'OWNER' && target.role !== 'SUPER_ADMIN' && !descendantAccountIds_(config.accounts, actor.id)[target.id]) throw new Error('Super Admin can change permissions only for staff accounts under that Super Admin.');
    if (actor.role === 'ADMIN' && !descendantAccountIds_(config.accounts,actor.id)[target.id]) throw new Error('Admin can change permissions only for staff accounts under that Admin.');
    if (actor.role !== 'OWNER' && actor.role !== 'SUPER_ADMIN' && actor.role !== 'ADMIN') throw new Error('Only the Master Owner, Super Admin or Shop Admin can change account permissions.');
    target.permissions = permissionsForChild_(actor, request.permissions || {}, target.role);
    cascadePermissionsToChildren_(config, target.id, target.permissions);
    saveAccessConfig_(config);
    return publicAccount_(target);
  });
}
function changeManagedPin(request) {
  const actor=accountForPin_(request&&request.actorPin), targetId=cleanText_(request&&request.targetId), newPin=cleanText_(request&&request.newPin);
  if(!actor) throw new Error('Please log in again.'); if(!/^\d{4,6}$/.test(newPin)) throw new Error('PIN must be 4 to 6 digits.');
  return withLock_(function(){const config=posAccessConfig_(), target=config.accounts.find(a=>a.id===targetId&&a.active!==false); if(!target) throw new Error('Account not found.');
    if(activeShopCode_()&&target.masterLocked) throw new Error('This first customer account PIN can be changed only from the Master Account.');
    // PIN control is deliberately centralised. Master Owner may change every
    // PIN. Super Admin may change only accounts below Super Admin. No lower
    // account may change any PIN, including its own.
        if(actor.id===target.id) { /* Any account may change only its own PIN after login. */ }
    else if(actor.role==='OWNER') { /* Master Owner may change every account PIN. */ }
    else if(actor.role==='SUPER_ADMIN') {
      if(target.role==='OWNER'||target.role==='SUPER_ADMIN') throw new Error('Only the Master Owner can change a Super Admin or Master Owner PIN.');
    } else throw new Error('You can change only your own PIN.');
    if(config.accounts.some(a=>a.id!==target.id&&a.pinHash===pinHash_(newPin))) throw new Error('Choose a PIN not used by another account.'); target.pinHash=pinHash_(newPin); saveAccessConfig_(config); return {id:target.id,name:target.name};
  });
}
function changeManagedUsername(request) {
  const actor=accountForPin_(request&&request.actorPin), targetId=cleanText_(request&&request.targetId), newUsername=cleanText_(request&&request.username);
  if(!actor) throw new Error('Please log in again.');
  if(!newUsername) throw new Error('Enter a username.');
  if(newUsername.length>60) throw new Error('Username is too long.');
  return withLock_(function(){const config=posAccessConfig_(),target=config.accounts.find(a=>a.id===targetId&&a.active!==false); if(!target) throw new Error('Account not found.');
    if(activeShopCode_()&&target.masterLocked) throw new Error('This first customer account username can be changed only from the Master Account.');
    if(actor.id===target.id) { /* Any account may change only its own username after login. */ }
    else if(actor.role==='OWNER') { /* Master Owner may change every username. */ }
    else if(actor.role==='SUPER_ADMIN') {
      if(target.role==='OWNER'||target.role==='SUPER_ADMIN') throw new Error('Only the Master Owner can change a Super Admin or Master Owner username.');
    } else throw new Error('You can change only your own username.');
    if(config.accounts.some(a=>a.id!==target.id&&cleanText_(a.name).toLowerCase()===newUsername.toLowerCase())) throw new Error('That username is already in use.');
    target.name=newUsername; saveAccessConfig_(config); return {id:target.id,name:target.name};
  });
}
/** Super Admin can safely disable or re-enable an account; account history is retained. */
function setManagedAccountActive(request) {
  const actor=accountForPin_(request&&request.actorPin), targetId=cleanText_(request&&request.targetId), active=request&&request.active===true;
  if(!actor || !isTopRole_(actor.role)) throw new Error('Only Master Owner or Super Admin can enable or disable accounts.');
  return withLock_(function(){const config=posAccessConfig_(), target=config.accounts.find(a=>a.id===targetId); if(!target) throw new Error('Account not found.'); if(target.role==='SUPER_ADMIN') throw new Error('The Master Super Admin account can never be disabled.'); target.active=active; saveAccessConfig_(config); return publicAccount_(target);});
}
/** Only Super Admin may delete an operational account. */
function deleteManagedAccount(request) {
  const actor=accountForPin_(request&&request.actorPin), targetId=cleanText_(request&&request.targetId);
  if(!actor || !isTopRole_(actor.role)) throw new Error('Only Master Owner or Super Admin can delete accounts.');
  return withLock_(function(){const config=posAccessConfig_(), target=config.accounts.find(a=>a.id===targetId); if(!target) throw new Error('Account not found.'); if(target.role==='SUPER_ADMIN') throw new Error('The Master Super Admin account can never be deleted.');
    const removeIds={}; const collect=function(id){removeIds[id]=true; config.accounts.filter(a=>a.parentId===id).forEach(a=>collect(a.id));}; collect(target.id); config.accounts=config.accounts.filter(a=>!removeIds[a.id]); saveAccessConfig_(config); return {name:target.name,deletedCount:Object.keys(removeIds).length};
  });
}

/** Renaming is also routed through the approval request queue. */
function renamePaymentOption(request) {return submitPaymentSetupRequest(Object.assign({},request||{},{action:'RENAME',name:request&&request.newName}));}

/** Creates one full return record for a previously issued bill-payment receipt. */
function returnPayment(request) {
  const approver = requireReturnApprovalPin_(request && request.adminPin);
  const originalNo = cleanText_(request && request.originalReceiptNo).toUpperCase();
  if (!originalNo) throw new Error('Enter the original payment receipt number.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const settings = getSettings_(ss);
    const payments = getOrCreateSheet_(ss, APP.SHEETS.PAYMENTS);
    ensureHeaders_(payments, paymentHeaders_());
    const rows = payments.getDataRange().getValues();
    const originalRow = rows.slice(1).find(function (row) { return cleanText_(row[0]).toUpperCase() === originalNo; });
    if (!originalRow) throw new Error('Payment receipt not found: ' + originalNo);
    const original = paymentReceiptFromRow_(originalRow, settings);
    if (original.type === 'PAYMENT_RETURN') throw new Error('A payment return cannot be returned again.');
    const alreadyReturned = rows.slice(1).some(function (row) {
      return cleanText_(row[11]).toUpperCase() === 'RETURN' && cleanText_(row[12]).toUpperCase() === originalNo;
    });
    if (alreadyReturned) throw new Error('This payment receipt has already been returned.');
    const returnNo = 'PAY-RET-' + originalNo;
    const now = new Date();
    const returnRow = [returnNo, now, original.wallet, original.biller, original.customerMobile, original.accountNo,
      -original.amount, -original.serviceCharge, -original.total, original.refNo, original.customerAddress, 'RETURN', originalNo, original.bank || '', original.customerName || '', original.customerId || '', -Number(original.cardCharge || 0), original.cardChargePct || ''];
    payments.appendRow(returnRow);
    return paymentReceiptFromRow_(returnRow, settings);
  });
}

function returnItem(request) {
  const approver = requireReturnApprovalPin_(request && request.adminPin);
  if (!request || !cleanText_(request.originalBillNo) || !cleanText_(request.itemId)) {
    throw new Error('Original bill number and item are required.');
  }
  const qty = positive_(request.qty, 'Return quantity');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const settings = getSettings_(ss);
    const bills = getSheet_(ss, APP.SHEETS.BILLS);
    const rows = bills.getDataRange().getValues();
    const originalBillNo = cleanText_(request.originalBillNo).toUpperCase();
    const original = rows.slice(1).find(function (r) {
      return String(r[0]).toUpperCase() === originalBillNo && String(r[7]).toUpperCase() === 'SALE';
    });
    if (!original) throw new Error('Original sale bill was not found.');

    const originalReceipt = receiptFromRow_(original, settings);
    const sold = originalReceipt.items.find(function (item) { return item.id === cleanText_(request.itemId); });
    if (!sold) throw new Error('Selected item is not on the original bill.');
    const alreadyReturned = rows.slice(1).filter(function (r) {
      return String(r[7]).toUpperCase() === 'RETURN' && String(r[8]).toUpperCase() === originalBillNo;
    }).reduce(function (sum, r) {
      const receipt = receiptFromRow_(r, settings);
      return sum + receipt.items.filter(function (item) { return item.id === sold.id; })
        .reduce(function (sub, item) { return sub + Number(item.qty); }, 0);
    }, 0);
    if (qty > sold.qty - alreadyReturned) throw new Error('Return quantity is more than the quantity sold.');

    const products = getProducts_(ss);
    const product = products.find(function (p) { return p.id === sold.id; });
    if (!product) throw new Error('Item is missing from the Stock sheet.');
    if (product.trackStock) adjustStock_(ss, product.id, qty);

    const returnNumber = 'RET-' + originalBillNo + '-' + (rows.slice(1).filter(function (r) {
      return String(r[7]).toUpperCase() === 'RETURN' && String(r[8]).toUpperCase() === originalBillNo;
    }).length + 1);
    const returnItem = Object.assign({}, sold, { qty: qty, lineDiscount: 0, lineTotal: round2_(sold.unitPrice * qty) });
    const total = returnItem.lineTotal;
    const now = new Date();
    bills.appendRow([returnNumber, now, cleanText_(request.customerPhone) || originalReceipt.customerPhone,
      JSON.stringify({ version: 2, items: [returnItem], subtotal: total, billDiscount: 0, total: total, approvedBy:approver.name, approvedAt:now.toISOString() }),
      -total, -(returnItem.cost * qty), -(total - returnItem.cost * qty), 'RETURN', originalBillNo]);
    return receiptFromRecord_({ billNo: returnNumber, date: now,
      customerPhone: cleanText_(request.customerPhone) || originalReceipt.customerPhone,
      items: [returnItem], subtotal: total, billDiscount: 0, total: total,
      type: 'RETURN', relatedBill: originalBillNo }, settings);
  });
}

/** Returns an item from an A4 invoice and adds it back to Invoice Stock. */
function returnInvoiceItem(request) {
  const approver = requireReturnApprovalPin_(request && request.adminPin);
  if (!request || !cleanText_(request.originalInvoiceNo) || !cleanText_(request.itemId)) {
    throw new Error('Original invoice number and item are required.');
  }
  const qty = positive_(request.qty, 'Return quantity');

  return withLock_(function () {
    const ss = getSpreadsheet_();
    const settings = getSettings_(ss);
    const invoices = getSheet_(ss, APP.SHEETS.INVOICES);
    const rows = invoices.getDataRange().getValues();
    const originalInvoiceNo = cleanText_(request.originalInvoiceNo).toUpperCase();
    const isInvoiceReturn = function (row) {
      try { const data = JSON.parse(row[4]); return data && data.type === 'RETURN'; } catch (e) { return false; }
    };
    const original = rows.slice(1).find(function (row) {
      return String(row[0]).toUpperCase() === originalInvoiceNo && !isInvoiceReturn(row);
    });
    if (!original) throw new Error('Original invoice was not found.');

    const originalReceipt = invoiceReceiptFromRow_(original, settings);
    const sold = originalReceipt.items.find(function (item) { return item.id === cleanText_(request.itemId); });
    if (!sold) throw new Error('Selected item is not on the original invoice.');
    const alreadyReturned = rows.slice(1).filter(function (row) {
      try { const data = JSON.parse(row[4]); return data && data.type === 'RETURN' && data.relatedInvoice === originalInvoiceNo; } catch (e) { return false; }
    }).reduce(function (sum, row) {
      const receipt = invoiceReceiptFromRow_(row, settings);
      return sum + receipt.items.filter(function (item) { return item.id === sold.id; })
        .reduce(function (sub, item) { return sub + Number(item.qty); }, 0);
    }, 0);
    if (qty > sold.qty - alreadyReturned) throw new Error('Return quantity is more than the quantity sold.');

    const products = ensureInvoiceStockMatchesNewBill_(ss);
    const product = products.find(function (item) { return item.id === sold.id; });
    if (!product) throw new Error('Item is missing from the Invoice Stock sheet.');
    if (product.trackStock) adjustStock_(ss, product.id, qty, APP.SHEETS.INVOICE_STOCK);

    const returnCount = rows.slice(1).filter(function (row) {
      try { const data = JSON.parse(row[4]); return data && data.type === 'RETURN' && data.relatedInvoice === originalInvoiceNo; } catch (e) { return false; }
    }).length;
    const returnNo = 'INV-RET-' + originalInvoiceNo + '-' + (returnCount + 1);
    const returnItem = Object.assign({}, sold, { qty: qty, lineDiscount: 0, lineTotal: round2_(sold.unitPrice * qty) });
    const total = returnItem.lineTotal;
    const now = new Date();
    invoices.appendRow([
      returnNo, now, originalReceipt.customerName, originalReceipt.customerPhone,
      JSON.stringify({ version: 2, type: 'RETURN', relatedInvoice: originalInvoiceNo, items: [returnItem], subtotal: total, billDiscount: 0, cardSurcharge: 0, paymentMethod: 'RETURN', total: -total, approvedBy:approver.name, approvedAt:now.toISOString() }),
      -total, -(returnItem.cost * qty), -(total - returnItem.cost * qty), originalReceipt.customerAddress
    ]);
    return { returnNo: returnNo, originalInvoiceNo: originalInvoiceNo, itemName: returnItem.name, qty: qty };
  });
}

/** Saves an A4 invoice (with warranty + serial per line). Stock is decremented. */
function saveInvoice(request) {
  if (!cleanText_(request && request.customerPhone)) throw new Error('Customer phone is required.');
  if (!request || !Array.isArray(request.items) || !request.items.length) {
    throw new Error('Please add at least one item to the invoice.');
  }
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const settings = getSettings_(ss);
    const products = ensureInvoiceStockMatchesNewBill_(ss);
    const productMap = Object.fromEntries(products.map(function (p) { return [p.id, p]; }));
    const items = normaliseInvoiceItems_(request.items, productMap);
    const subtotal = round2_(items.reduce(function (sum, item) { return sum + item.lineTotal; }, 0));
    const billDiscount = nonNegative_(request.billDiscount, 'Invoice discount');
    if (billDiscount > subtotal) throw new Error('Invoice discount cannot be more than the subtotal.');

    validateStock_(items, productMap);
    validateSerialsForSale_(ss, items);
    const invoiceNo = nextInvoiceNo_(settings);
    const now = new Date();
    const paymentMethod = cleanText_(request.paymentMethod).toUpperCase();
    const checkNo = cleanText_(request.checkNo);
    const checkDate = cleanText_(request.checkDate);
    const cardSurcharge = paymentMethod === 'CARD' ? nonNegative_(request.cardSurcharge, 'Card surcharge') : 0;
    const total = round2_(subtotal - billDiscount + cardSurcharge);
    const costTotal = round2_(items.reduce(function (sum, item) { return sum + item.cost * item.qty; }, 0));
    if (!['CASH', 'CREDIT', 'CHECK', 'CARD', 'BANK_TRANSFER', 'BANK_PAYMENT', 'WALLET_PAYMENT', 'KOKO', 'ONLINE_PAYMENT'].includes(paymentMethod)) throw new Error('Select a valid payment method.');
    if (checkNo && paymentMethod !== 'CHECK') throw new Error('Check number is only for check payments.');
    if (paymentMethod === 'CHECK' && !checkNo) throw new Error('Enter the check number.');
    const paidAmount = request.paidAmount === undefined || request.paidAmount === null || cleanText_(request.paidAmount) === '' ? (paymentMethod === 'CREDIT' ? 0 : total) : nonNegative_(request.paidAmount, 'Customer paid amount');
    const changeAmount = round2_(Math.max(0, paidAmount - total));
    const creditBalance = round2_(Math.max(0, total - paidAmount));
    let creditCustomer;
    if (creditBalance > 0) {
      creditCustomer = getOrCreateCreditCustomer_(ss, settings, request.customerName, request.customerPhone);
      const outstanding = getCustomerOutstanding_(ss, creditCustomer.key);
      if (round2_(outstanding + creditBalance) > creditCustomer.creditLimit) {
        throw new Error('Credit limit exceeded for ' + creditCustomer.name + '. Available credit: ' + round2_(Math.max(0, creditCustomer.creditLimit - outstanding)) + '.');
      }
    }
    const invoices = getOrCreateSheet_(ss, APP.SHEETS.INVOICES);
    ensureHeaders_(invoices, invoiceHeaders_());

    decrementStock_(ss, items, productMap, APP.SHEETS.INVOICE_STOCK);
    markSerialsSold_(ss, items, invoiceNo);
    invoices.appendRow([
      invoiceNo, now, cleanText_(request.customerName), cleanText_(request.customerPhone),
      JSON.stringify({ version: 3, items: items, subtotal: subtotal, billDiscount: billDiscount, cardSurcharge: cardSurcharge, paymentMethod: paymentMethod, checkNo: checkNo, checkDate: checkDate, paidAmount: paidAmount, changeAmount: changeAmount, creditBalance: creditBalance, total: total }),
      total, costTotal, round2_(total - costTotal), cleanText_(request.customerAddress)
    ]);
    if (creditBalance > 0) {
      const ledger = getOrCreateSheet_(ss, APP.SHEETS.CREDIT_LEDGER);
      ensureHeaders_(ledger, creditLedgerHeaders_());
      ledger.appendRow([new Date(), creditCustomer.key, creditCustomer.name, creditCustomer.phone, 'CREDIT SALE', invoiceNo, creditBalance, 0, creditBalance, 'Invoice balance']);
    }
    setSetting_(ss, 'NEXT_INVOICE_NUMBER', Number(settings.NEXT_INVOICE_NUMBER || APP.DEFAULTS.NEXT_INVOICE_NUMBER) + 1);

    return invoiceReceiptFromRecord_({
      invoiceNo: invoiceNo, date: now,
      customerName: cleanText_(request.customerName),
      customerPhone: cleanText_(request.customerPhone),
      customerAddress: cleanText_(request.customerAddress),
      items: items, subtotal: subtotal, billDiscount: billDiscount, cardSurcharge: cardSurcharge,
      paymentMethod: paymentMethod, checkNo: checkNo, checkDate: checkDate, paidAmount: paidAmount, creditBalance: creditBalance, changeAmount: changeAmount, total: total
    }, settings);
  });
}

/** Returns an already-issued invoice for reprinting. */
function findInvoice(query) {
  const invoiceNo = cleanText_(query).toUpperCase();
  if (!invoiceNo) throw new Error('Enter an invoice number.');
  const ss = getSpreadsheet_();
  const settings = getSettings_(ss);
  const invoices = ss.getSheetByName(APP.SHEETS.INVOICES);
  if (!invoices || invoices.getLastRow() < 2) throw new Error('No invoices have been saved yet.');
  const row = invoices.getDataRange().getValues().slice(1).find(function (r) {
    return String(r[0]).toUpperCase() === invoiceNo;
  });
  if (!row) throw new Error('Invoice not found: ' + invoiceNo);
  return invoiceReceiptFromRow_(row, settings);
}

function saveQuotation(r){if(!r||!Array.isArray(r.items)||!r.items.length)throw new Error('Please add at least one item to the quotation.');if(!cleanText_(r.customerPhone))throw new Error('Customer phone is required.');return withLock_(function(){const ss=getSpreadsheet_(),s=getSettings_(ss),sale=Object.fromEntries(getProducts_(ss,APP.SHEETS.STOCK).map(p=>[p.id,p])),inv=Object.fromEntries(getProducts_(ss,APP.SHEETS.INVOICE_STOCK).map(p=>[p.id,p]));const items=r.items.map(function(x){const source=cleanText_(x.source)==='INVOICE'?'INVOICE':'SALE',p=(source==='INVOICE'?inv:sale)[cleanText_(x.id)];if(!p)throw new Error('Item not found: '+cleanText_(x.id));const qty=positive_(x.qty,'Quantity'),unitPrice=nonNegative_(x.unitPrice,'Price'),lineDiscount=nonNegative_(x.lineDiscount,'Line discount'),gross=round2_(qty*unitPrice);if(lineDiscount>gross)throw new Error('Line discount cannot be more than the line amount.');return{id:p.id,name:p.name,source:source,qty:qty,unitPrice:unitPrice,lineDiscount:lineDiscount,warranty:source==='INVOICE'?cleanText_(x.warranty||p.warranty):'',serial:source==='INVOICE'?cleanText_(x.serial||p.serial):'',cost:p.cost,lineTotal:round2_(gross-lineDiscount)}});const subtotal=round2_(items.reduce((a,x)=>a+x.lineTotal,0)),discount=nonNegative_(r.discount,'Quotation discount');if(discount>subtotal)throw new Error('Discount cannot be more than the subtotal.');const now=new Date(),validUntil=new Date(now.getTime()+7*86400000),n=Math.max(1,Number(s.NEXT_QUOTATION_NUMBER||1)),quoteNo=(s.INVOICE_PREFIX||APP.DEFAULTS.INVOICE_PREFIX)+String(n).padStart(4,'0')+'QT',total=round2_(subtotal-discount),sh=getOrCreateSheet_(ss,APP.SHEETS.QUOTATIONS);ensureHeaders_(sh,['Quotation No','Date & Time','Customer Name','Customer Phone','Customer Address','Items (JSON)','Subtotal','Discount','Total','Valid Until','Status']);sh.appendRow([quoteNo,now,cleanText_(r.customerName),cleanText_(r.customerPhone),cleanText_(r.customerAddress),JSON.stringify(items),subtotal,discount,total,validUntil,'ACTIVE']);setSetting_(ss,'NEXT_QUOTATION_NUMBER',n+1);return quotationFromRecord_({quoteNo,date:now,validUntil,customerName:cleanText_(r.customerName),customerPhone:cleanText_(r.customerPhone),customerAddress:cleanText_(r.customerAddress),items,subtotal,discount,total,status:'ACTIVE'},s)})}
function findQuotation(q){const no=cleanText_(q).toUpperCase();if(!no)throw new Error('Enter a quotation number.');const ss=getSpreadsheet_(),s=getSettings_(ss),sh=ss.getSheetByName(APP.SHEETS.QUOTATIONS);if(!sh||sh.getLastRow()<2)throw new Error('No quotations have been saved yet.');const row=sh.getDataRange().getValues().slice(1).find(r=>String(r[0]).toUpperCase()===no);if(!row)throw new Error('Quotation not found: '+no);let items=[];try{items=JSON.parse(row[5])||[]}catch(e){}return quotationFromRecord_({quoteNo:String(row[0]),date:row[1],customerName:cleanText_(row[2]),customerPhone:cleanText_(row[3]),customerAddress:cleanText_(row[4]),items,subtotal:Number(row[6]||0),discount:Number(row[7]||0),total:Number(row[8]||0),validUntil:row[9],status:cleanText_(row[10])||'ACTIVE'},s)}
function cancelQuotation(q){const no=cleanText_(q).toUpperCase();if(!no)throw new Error('Enter a quotation number.');return withLock_(function(){const ss=getSpreadsheet_(),sh=getOrCreateSheet_(ss,APP.SHEETS.QUOTATIONS);ensureHeaders_(sh,['Quotation No','Date & Time','Customer Name','Customer Phone','Customer Address','Items (JSON)','Subtotal','Discount','Total','Valid Until','Status']);const rows=sh.getDataRange().getValues(),index=rows.slice(1).findIndex(r=>String(r[0]).toUpperCase()===no);if(index<0)throw new Error('Quotation not found: '+no);if(cleanText_(rows[index+1][10]).toUpperCase()==='CANCELLED')throw new Error('This quotation has already been cancelled.');sh.getRange(index+2,11).setValue('CANCELLED');return{quoteNo:no,status:'CANCELLED'};})}
function quotationFromRecord_(r,s){return Object.assign({},r,{type:'QUOTATION',settings:publicSettings_(s),date:new Date(r.date).toISOString(),validUntil:new Date(r.validUntil).toISOString()})}

/** Returns the two stock lists used in Quotation. */
function getQuotationProducts() { const ss = getSpreadsheet_(), sale = getProducts_(ss, APP.SHEETS.STOCK); return { sale: sale, invoice: ensureInvoiceStockMatchesNewBill_(ss, sale) }; }

/** Always reads the current saved/restored stock sheets for the universal Stock Lookup tile. */
function getStockLookupProducts(request) {
  setShopContextFromRequest_(request);
  const actor = accountForPin_(request && request.actorPin);
  if (!actor) throw new Error('Please log in again.');
  const ss = getSpreadsheet_();
  const sale = getProducts_(ss, APP.SHEETS.STOCK).map(function (p) {
    return Object.assign({ stockSide: 'New Bill Stock' }, p);
  });
  const invoice = getProducts_(ss, APP.SHEETS.INVOICE_STOCK).map(function (p) {
    return Object.assign({ stockSide: 'Invoice Stock' }, p);
  });
  const merged = {}, ordered = [];
  function upsert_(product) {
    const id = cleanText_(product && product.id).toUpperCase();
    if (!id) return;
    const current = merged[id];
    if (!current) {
      merged[id] = Object.assign({}, product);
      ordered.push(id);
      return;
    }
    if (!current.name && product.name) current.name = product.name;
    if (!current.barcode && product.barcode) current.barcode = product.barcode;
    if (!current.category && product.category) current.category = product.category;
    if (!current.warranty && product.warranty) current.warranty = product.warranty;
    if (!current.serial && product.serial) current.serial = product.serial;
    current.cost = Number.isFinite(Number(current.cost)) ? Number(current.cost) : Number(product.cost || 0);
    current.price = Number.isFinite(Number(current.price)) ? Number(current.price) : Number(product.price || 0);
    current.stock = Math.max(Number(current.stock || 0), Number(product.stock || 0));
    current.trackStock = !!(current.trackStock || product.trackStock);
    if (product.stockSide && current.stockSide && current.stockSide.indexOf(product.stockSide) < 0) current.stockSide += ' / ' + product.stockSide;
    else if (!current.stockSide && product.stockSide) current.stockSide = product.stockSide;
  }
  sale.forEach(upsert_);
  invoice.forEach(upsert_);
  return ordered.map(function (id) { return merged[id]; });
}

function getProducts_(ss, sheetName) {
  const values = getSheet_(ss, sheetName || APP.SHEETS.STOCK).getDataRange().getValues();
  return normaliseStockRows_(values);
}

const STOCK_HEADERS_ = ['Item ID','Item Name','Cost Price','Selling Price','Stock Qty','Track Stock','Status','Category','Warranty Period','Serial Number','Barcode'];
const STOCK_FIELD_ALIASES_ = Object.freeze({
  id: ['Item ID','ID','Item Code','ItemCode','Code','Product ID','ProductID','Product Code','ProductCode','Barcode','BarCode'],
  name: ['Item Name','Name','Product Name','ProductName','Description','Title','Item Description'],
  cost: ['Cost Price','Purchase Price','PurchasePrice','Buying Price','BuyingPrice','Cost','Price2','Unit Cost'],
  price: ['Selling Price','Sale Price','SalePrice','Retail Price','RetailPrice','Unit Price','UnitPrice','Price','Price1'],
  stock: ['Stock Qty','Stock Quantity','StockQuantity','Available Quantity','AvailableQuantity','Available Qty','AvailableQty','Current Stock','CurrentStock','Quantity','Qty','QTY','Stock'],
  track: ['Track Stock','Stock Control','StockControl','Stock Enabled','TrackStock'],
  status: ['Status','State','Active','Enabled'],
  category: ['Category','Category Name','CategoryName','Group','Group Name','GroupName'],
  warranty: ['Warranty Period','Warranty','WarrantyPeriod'],
  serial: ['Serial Number','Serial','IMEI','IMEI Number'],
  barcode: ['Barcode','Bar Code','BarCode','EAN','UPC']
});

function stockHeaderKey_(value) { return cleanText_(value).replace(/[^a-z0-9]/gi, '').toUpperCase(); }
function stockHeaderMap_(headers) {
  const map = {};
  (headers || []).forEach(function (header, index) {
    const key = stockHeaderKey_(header);
    if (key && map[key] === undefined) map[key] = index;
  });
  return map;
}
function stockHeaderIndex_(map, aliases) {
  for (let i = 0; i < aliases.length; i++) {
    const key = stockHeaderKey_(aliases[i]);
    if (key && map[key] !== undefined) return map[key];
  }
  return -1;
}
function stockRowField_(map, row, aliases, fallbackIndex) {
  const index = stockHeaderIndex_(map, aliases);
  if (index >= 0 && index < row.length) return row[index];
  if (fallbackIndex !== undefined && fallbackIndex !== null && fallbackIndex < row.length) return row[fallbackIndex];
  return '';
}
function stockRowText_(map, row, aliases, fallbackIndex) {
  return cleanText_(stockRowField_(map, row, aliases, fallbackIndex));
}
function stockRowNumber_(map, row, aliases, fallbackIndex) {
  const text = stockRowText_(map, row, aliases, fallbackIndex).replace(/[^0-9.\-]/g, '');
  const value = Number(text);
  return isFinite(value) ? value : 0;
}
function stockRowYesNo_(map, row, aliases, fallbackIndex) {
  const value = stockRowText_(map, row, aliases, fallbackIndex).toUpperCase();
  return ['YES', 'TRUE', '1', 'Y', 'ON', 'ACTIVE', 'ENABLED'].includes(value);
}
function normaliseStockRows_(values) {
  if (!Array.isArray(values) || !values.length) return [];
  const headers = Array.isArray(values[0]) ? values[0].map(cleanText_) : [];
  const map = stockHeaderMap_(headers);
  return values.slice(1).filter(Array.isArray).map(function (row) {
    const id = stockRowText_(map, row, STOCK_FIELD_ALIASES_.id, 0);
    const name = stockRowText_(map, row, STOCK_FIELD_ALIASES_.name, 1);
    const status = stockRowText_(map, row, STOCK_FIELD_ALIASES_.status, 6).toUpperCase();
    if (!id || !name) return null;
    if (['NO', 'INACTIVE', 'DISABLED', 'DELETED', 'REMOVED'].includes(status)) return null;
    const stockHeaderFound = stockHeaderIndex_(map, STOCK_FIELD_ALIASES_.stock) >= 0;
    const track = stockRowYesNo_(map, row, STOCK_FIELD_ALIASES_.track, 5) || stockHeaderFound || stockRowNumber_(map, row, STOCK_FIELD_ALIASES_.stock, 4) !== 0 || stockRowText_(map, row, STOCK_FIELD_ALIASES_.stock, 4) !== '';
    return {
      id: id,
      name: name,
      cost: stockRowNumber_(map, row, STOCK_FIELD_ALIASES_.cost, 2),
      price: stockRowNumber_(map, row, STOCK_FIELD_ALIASES_.price, 3),
      stock: stockRowNumber_(map, row, STOCK_FIELD_ALIASES_.stock, 4),
      trackStock: !!track,
      category: stockRowText_(map, row, STOCK_FIELD_ALIASES_.category, 7),
      warranty: stockRowText_(map, row, STOCK_FIELD_ALIASES_.warranty, 8),
      serial: stockRowText_(map, row, STOCK_FIELD_ALIASES_.serial, 9),
      barcode: stockRowText_(map, row, STOCK_FIELD_ALIASES_.barcode, 10)
    };
  }).filter(Boolean);
}

function normaliseSaleItems_(requested, productMap) {
  const merged = {};
  requested.forEach(function (line) {
    const id = cleanText_(line.id);
    const product = productMap[id];
    if (!product) throw new Error('Item not found: ' + (line.name || id));
    const qty = positive_(line.qty, 'Quantity');
    const unitPrice = nonNegative_(line.unitPrice, 'Price');
    const lineDiscount = nonNegative_(line.lineDiscount, 'Line discount');
    const gross = round2_(unitPrice * qty);
    if (lineDiscount > gross) throw new Error('Line discount cannot be more than the line amount.');
    const key = id + '|' + unitPrice + '|' + lineDiscount;
    if (!merged[key]) merged[key] = { id: id, name: product.name, qty: 0, basePrice: product.price,
      unitPrice: unitPrice, lineDiscount: lineDiscount, cost: product.cost, lineTotal: 0 };
    merged[key].qty += qty;
    merged[key].lineTotal = round2_(merged[key].unitPrice * merged[key].qty - merged[key].lineDiscount);
  });
  return Object.keys(merged).map(function (k) { return merged[k]; });
}

/** Invoice items keep per-line warranty + serial (typed by user), so no merging. */
function normaliseInvoiceItems_(requested, productMap) {
  return requested.map(function (line, idx) {
    const id = cleanText_(line.id);
    const product = productMap[id];
    if (!product) throw new Error('Item not found: ' + (line.name || id));
    const qty = positive_(line.qty, 'Quantity');
    const unitPrice = nonNegative_(line.unitPrice, 'Price');
    const lineDiscount = nonNegative_(line.lineDiscount, 'Line discount');
    const gross = round2_(unitPrice * qty);
    if (lineDiscount > gross) throw new Error('Line discount cannot be more than the line amount.');
    return {
      id: id, name: product.name, qty: qty, basePrice: product.price,
      unitPrice: unitPrice, lineDiscount: lineDiscount,
      warranty: cleanText_(line.warranty), serial: cleanText_(line.serial),
      cost: product.cost, lineTotal: round2_(gross - lineDiscount),
      lineKey: 'L' + (idx + 1)
    };
  });
}

function validateStock_(items, productMap) {
  const requested = {};
  items.forEach(function (item) { requested[item.id] = (requested[item.id] || 0) + item.qty; });
  Object.keys(requested).forEach(function (id) {
    const product = productMap[id];
    if (product.trackStock && product.stock < requested[id]) {
      throw new Error(product.name + ' has only ' + product.stock + ' in stock.');
    }
  });
}

function decrementStock_(ss, items, productMap, sheetName) {
  const changes = {};
  items.forEach(function (item) { if (productMap[item.id].trackStock) changes[item.id] = (changes[item.id] || 0) - item.qty; });
  Object.keys(changes).forEach(function (id) { adjustStock_(ss, id, changes[id], sheetName); });
}

function markSerialsSold_(ss, items, referenceNo) {
  const sh = ss.getSheetByName(APP.SHEETS.SERIAL_STOCK);
  if (!sh || sh.getLastRow() < 2) return;
  const rows = sh.getDataRange().getValues();
  items.forEach(function(item) {
    cleanText_(item.serial).split(/[\n,;]+/).map(cleanText_).filter(Boolean).forEach(function(serial) {
      const index = rows.slice(1).findIndex(function(row) { return cleanText_(row[3]) === item.id && cleanText_(row[5]).toUpperCase() === serial.toUpperCase() && cleanText_(row[7]).toUpperCase() !== 'SOLD'; });
      if (index >= 0) sh.getRange(index + 2, 8, 1, 3).setValues([['SOLD', referenceNo, new Date()]]);
    });
  });
}

function validateSerialsForSale_(ss, items) {
  const sh = ss.getSheetByName(APP.SHEETS.SERIAL_STOCK);
  if (!sh || sh.getLastRow() < 2) return;
  const rows = sh.getDataRange().getValues().slice(1);
  items.forEach(function(item) {
    const available = rows.filter(function(row) { return cleanText_(row[3]) === item.id && cleanText_(row[7]).toUpperCase() !== 'SOLD'; });
    if (!available.length) return;
    const serials = cleanText_(item.serial).split(/[\n,;]+/).map(cleanText_).filter(Boolean);
    if (!serials.length) return;
    if (serials.length > Number(item.qty || 0)) throw new Error(item.name + ' has more serial numbers than the invoice quantity.');
    serials.forEach(function(serial) {
      if (!available.some(function(row) { return cleanText_(row[5]).toUpperCase() === serial.toUpperCase(); })) throw new Error('Serial number is not available in stock: ' + serial);
    });
  });
}

function adjustStock_(ss, itemId, change, sheetName) {
  const sheet = getSheet_(ss, sheetName || APP.SHEETS.STOCK);
  const rows = sheet.getDataRange().getValues();
  const headers = Array.isArray(rows[0]) ? rows[0].map(cleanText_) : [];
  const map = stockHeaderMap_(headers);
  const index = rows.slice(1).findIndex(function (r) { return stockRowText_(map, r, STOCK_FIELD_ALIASES_.id, 0).toUpperCase() === cleanText_(itemId).toUpperCase(); });
  if (index < 0) throw new Error('Item is missing from Stock: ' + itemId);
  const cell = sheet.getRange(index + 2, stockHeaderIndex_(map, STOCK_FIELD_ALIASES_.stock) >= 0 ? stockHeaderIndex_(map, STOCK_FIELD_ALIASES_.stock) + 1 : 5);
  cell.setValue(Number(cell.getValue() || 0) + Number(change));
}

function receiptFromRow_(row, settings) {
  let data;
  try { data = JSON.parse(row[3]); } catch (e) { data = { items: [] }; }
  const items = Array.isArray(data) ? data : (data.items || []);
  return receiptFromRecord_({ billNo: String(row[0]), date: row[1], customerPhone: cleanText_(row[2]), customerAddress: cleanText_(data.customerAddress),
    items: items, subtotal: Number(data.subtotal || Math.abs(Number(row[4] || 0))),
    billDiscount: Number(data.billDiscount || 0), paymentMethod: cleanText_(data.paymentMethod), checkNo: cleanText_(data.checkNo), checkDate: cleanText_(data.checkDate), paidAmount:data.paidAmount===undefined?Math.abs(Number(data.total === undefined ? row[4] : data.total)):Number(data.paidAmount||0), creditBalance:Number(data.creditBalance||0), total: Math.abs(Number(data.total === undefined ? row[4] : data.total)),
    type: cleanText_(row[7]) || 'SALE', relatedBill: cleanText_(row[8]) }, settings);
}

function receiptFromRecord_(record, settings) {
  return Object.assign({}, record, { type: 'SALE', settings: publicSettings_(settings), date: new Date(record.date).toISOString() });
}

function invoiceReceiptFromRow_(row, settings) {
  let data;
  try { data = JSON.parse(row[4]); } catch (e) { data = { items: [] }; }
  const items = Array.isArray(data) ? data : (data.items || []);
  return invoiceReceiptFromRecord_({
    invoiceNo: String(row[0]), date: row[1],
    customerName: cleanText_(row[2]), customerPhone: cleanText_(row[3]), customerAddress: cleanText_(row[8]),
    items: items,
    subtotal: Number(data.subtotal || Math.abs(Number(row[5] || 0))),
    billDiscount: Number(data.billDiscount || 0), cardSurcharge: Number(data.cardSurcharge || 0),
    paymentMethod: cleanText_(data.paymentMethod), checkNo: cleanText_(data.checkNo), checkDate: cleanText_(data.checkDate), paidAmount: data.paidAmount === undefined ? Math.abs(Number(data.total === undefined ? row[5] : data.total)) : Number(data.paidAmount || 0), creditBalance: Number(data.creditBalance || 0),
    total: Math.abs(Number(data.total === undefined ? row[5] : data.total))
  }, settings);
}

function invoiceReceiptFromRecord_(record, settings) {
  return Object.assign({}, record, { type: 'INVOICE', settings: publicSettings_(settings), date: new Date(record.date).toISOString() });
}

function paymentReceiptFromRow_(row, settings) {
  const paymentMethod = cleanText_(row[11]).toUpperCase() || 'PAYMENT';
  return {
    type: paymentMethod === 'RETURN' ? 'PAYMENT_RETURN' : 'PAYMENT', paymentMethod: paymentMethod, billNo: cleanText_(row[0]), date: new Date(row[1]).toISOString(),
    relatedReceipt: cleanText_(row[12]), wallet: cleanText_(row[2]), bank: cleanText_(row[13]), biller: cleanText_(row[3]), customerMobile: cleanText_(row[4]), customerAddress: cleanText_(row[10]),
    customerName: cleanText_(row[14]), customerId: cleanText_(row[15]), accountNo: cleanText_(row[5]), amount: Number(row[6] || 0), serviceCharge: Number(row[7] || 0),
    total: Number(row[8] || 0), refNo: cleanText_(row[9]), cardCharge: Number(row[16] || 0), cardChargePct: cleanText_(row[17]), settings: publicSettings_(settings)
  };
}

function getCompanyDetails(actorPin) {
  if (actorPin) companySettingsAccess_(actorPin);
  return publicSettings_(getSettings_(getSpreadsheet_()));
}

function restaurantHeaders_(){return ['Menu ID','Category','Item Name','Item Type','Cost Price','Selling Price','Status','Notes','Updated At','Updated By'];}
function restaurantActor_(request){setShopContextFromRequest_(request);return requirePermission_(request&&request.actorPin,'restaurant');}
function restaurantRowToObject_(row){return{id:cleanText_(row[0]),category:cleanText_(row[1]),name:cleanText_(row[2]),itemType:cleanText_(row[3]),cost:Number(row[4]||0),price:Number(row[5]||0),status:cleanText_(row[6])||'ACTIVE',notes:cleanText_(row[7]),updatedAt:row[8],updatedBy:cleanText_(row[9])};}
function activityLogHeaders_(){return['Log ID','Date & Time','Tile','Action','Record Type','Record No','Name','Details','Actor','Shop Code'];}
function appendActivityLog_(ss,tile,action,recordType,recordNo,name,details,actorName){
  const sh=getOrCreateSheet_(ss,APP.SHEETS.ACTIVITY_LOG);
  ensureHeaders_(sh,activityLogHeaders_());
  const logNo='LOG-'+AppUtilities.getUuid().slice(0,8).toUpperCase();
  sh.appendRow([logNo,new Date(),cleanText_(tile),cleanText_(action),cleanText_(recordType),cleanText_(recordNo),cleanText_(name),cleanText_(details),cleanText_(actorName),activeShopCode_()||'MASTER']);
  return logNo;
}
function getRestaurantMenu_(){
  const sh=getOrCreateSheet_(getSpreadsheet_(),APP.SHEETS.RESTAURANT_MENU);
  ensureHeaders_(sh,restaurantHeaders_());
  if(sh.getLastRow()<2)return [];
  return sh.getDataRange().getValues().slice(1).map(restaurantRowToObject_).filter(function(item){return item.id&&item.status!=='DELETED';});
}
function getRestaurantMenu(request){restaurantActor_(request);return getRestaurantMenu_();}
function saveRestaurantMenuItem(request){
  const actor=restaurantActor_(request), id=cleanText_(request&&request.id), category=cleanText_(request&&request.category), name=cleanText_(request&&request.name), itemType=cleanText_(request&&request.itemType)||'Food', cost=nonNegative_(request&&request.cost,'Cost price'), price=nonNegative_(request&&request.price,'Selling price'), status=cleanText_(request&&request.status).toUpperCase()==='INACTIVE'?'INACTIVE':'ACTIVE', notes=cleanText_(request&&request.notes);
  if(!category)throw new Error('Enter a food/menu category.');
  if(!name)throw new Error('Enter the food/item name.');
  return withLock_(function(){
    const ss=getSpreadsheet_();
    const sh=getOrCreateSheet_(getSpreadsheet_(),APP.SHEETS.RESTAURANT_MENU);
    ensureHeaders_(sh,restaurantHeaders_());
    const rows=sh.getDataRange().getValues(), now=new Date(), nextId=id||('MENU-'+AppUtilities.getUuid().slice(0,8).toUpperCase()), values=[nextId,category,name,itemType,cost,price,status,notes,now,actor.name];
    const index=rows.slice(1).findIndex(function(row){return cleanText_(row[0])===nextId;});
    if(index>=0)sh.getRange(index+2,1,1,values.length).setValues([values]);else sh.appendRow(values);
    appendActivityLog_(ss,'Restaurant / Food Menu',index>=0?'UPDATE':'ADD','RESTAURANT_MENU',nextId,name,'Category: '+category+' | Type: '+itemType+' | Status: '+status,actor.name);
    return restaurantRowToObject_(values);
  });
}
function deleteRestaurantMenuItem(request){
  const actor=restaurantActor_(request), id=cleanText_(request&&request.id);
  if(!id)throw new Error('Choose a menu item to delete.');
  return withLock_(function(){
    const ss=getSpreadsheet_();
    const sh=getOrCreateSheet_(ss,APP.SHEETS.RESTAURANT_MENU);
    ensureHeaders_(sh,restaurantHeaders_());
    const rows=sh.getDataRange().getValues(), index=rows.slice(1).findIndex(function(row){return cleanText_(row[0])===id;});
    if(index<0)throw new Error('Menu item not found.');
    sh.getRange(index+2,7,1,3).setValues([['DELETED',new Date(),actor.name]]);
    appendActivityLog_(ss,'Restaurant / Food Menu','DELETE','RESTAURANT_MENU',id,cleanText_(rows[index+1][2]),'Deleted menu item',actor.name);
    return{id:id,deleted:true};
  });
}

function saveShanPosSystemManagement(request) {
  setShopContextFromRequest_(request);
  const actor = accountForPin_(request && request.actorPin);
  if (!actor || actor.role !== 'OWNER' || activeShopCode_()) throw new Error('Only the Software Owner can change SHAN POS System Management settings.');
  if (!masterSupabaseProjectId_()) {
    const props = AppProperties.getScriptProperties();
    if (request && request.softwareLogoDataUrl) {
      props.setProperty('GLOBAL_SOFTWARE_LOGO_URL', saveLogoFile_(request.softwareLogoDataUrl));
      // Keep a deployment-safe copy.  A new Apps Script deployment may not
      // be able to resolve the old Drive file, but this data URL remains
      // available to the login screen and is controlled only by the owner.
      props.setProperty('GLOBAL_SOFTWARE_LOGO_DATA', String(request.softwareLogoDataUrl));
    }
    props.setProperty('GLOBAL_POS_BRAND_FOOTER', cleanText_(request && request.posBrandFooter) || 'SHAN POS SYSTEMS');
    props.setProperty('GLOBAL_POS_BRAND_FOOTER_ENABLED', request && request.posBrandFooterEnabled === true ? 'YES' : 'NO');
    if (request && request.printPaperMode) props.setProperty('GLOBAL_PRINT_PAPER_MODE', cleanText_(request.printPaperMode).toUpperCase());
    props.setProperty('GLOBAL_PRINT_AUTO_CUT_FEED', request && request.autoCutFeed === false ? 'NO' : 'YES');
    return publicSettings_({});
  }
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const currentSettings = getSettings_(ss);
    const footer = cleanText_(request && request.posBrandFooter) || 'SHAN POS SYSTEMS';
    const allowedModes = ['A4','A5','CONTINUOUS','THERMAL_80','THERMAL_58','BLUETOOTH_210'];
    setSetting_(ss, 'POS_BRAND_FOOTER', footer);
    setSetting_(ss, 'POS_BRAND_FOOTER_ENABLED', request && request.posBrandFooterEnabled === true ? 'YES' : 'NO');
    if (request && Object.prototype.hasOwnProperty.call(request, 'printPaperMode')) {
      const mode = cleanText_(request.printPaperMode || currentSettings.PRINT_PAPER_MODE).toUpperCase();
      setSetting_(ss, 'PRINT_PAPER_MODE', allowedModes.indexOf(mode) >= 0 ? mode : (currentSettings.PRINT_PAPER_MODE || 'A4'));
    }
    if (request && Object.prototype.hasOwnProperty.call(request, 'autoCutFeed')) {
      setSetting_(ss, 'PRINT_AUTO_CUT_FEED', request.autoCutFeed === false ? 'NO' : 'YES');
    }
    setSetting_(ss, 'CASH_BALANCE_ENABLED', request && request.cashBalanceEnabled === false ? 'NO' : 'YES');
    if (request && request.softwareLogoDataUrl) {
      setSetting_(ss, 'SOFTWARE_LOGO_URL', saveLogoFile_(request.softwareLogoDataUrl));
      AppProperties.getScriptProperties().setProperty('GLOBAL_SOFTWARE_LOGO_DATA', String(request.softwareLogoDataUrl));
    }
    saveGlobalShanPosManagement_(getSettings_(ss));
    return publicSettings_(getSettings_(ss));
  });
}

function saveCompanyDetails(request) {
  // Apps Script does not retain the previous request's active shop. Resolve
  // it from this request before checking permissions or opening the data set.
  setShopContextFromRequest_(request);
  const access=companySettingsAccess_(request && request.actorPin), current=getSettings_(getSpreadsheet_());
  if(!access.identity && access.permissions.settings!==true) throw new Error('You do not have permission to edit shop settings.');
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const fields = {
      BUSINESS_NAME: access.identity ? cleanText_(request.companyName) : current.BUSINESS_NAME,
      BUSINESS_REG_NO: access.identity ? cleanText_(request.registrationNo) : current.BUSINESS_REG_NO,
      BUSINESS_ADDRESS1: access.identity ? cleanText_(request.address1) : current.BUSINESS_ADDRESS1,
      BUSINESS_ADDRESS2: access.identity ? cleanText_(request.address2) : current.BUSINESS_ADDRESS2,
      BUSINESS_ADDRESS3: access.identity ? cleanText_(request.address3) : current.BUSINESS_ADDRESS3,
      BUSINESS_PHONE_LINE1: access.identity ? cleanText_(request.mobile1) : current.BUSINESS_PHONE_LINE1,
      BUSINESS_PHONE_LINE2: access.identity ? cleanText_(request.mobile2) : current.BUSINESS_PHONE_LINE2,
      BUSINESS_EMAIL: access.identity ? cleanText_(request.email) : current.BUSINESS_EMAIL,
      BUSINESS_WEBSITE: access.identity ? cleanText_(request.website) : current.BUSINESS_WEBSITE,
      BUSINESS_MODE: access.identity ? cleanText_(request.businessMode || current.BUSINESS_MODE || 'SINGLE_SHOP').toUpperCase() : current.BUSINESS_MODE,
      BRANCH_MANAGEMENT_ENABLED: access.identity && branchReadAllowedForBusinessMode_(request.businessMode) && request.branchManagementEnabled === true ? 'YES' : (access.identity ? 'NO' : current.BRANCH_MANAGEMENT_ENABLED),
      MAIN_BRANCH_NAME: access.identity ? cleanText_(request.mainBranchName) : current.MAIN_BRANCH_NAME,
      RECEIPT_HEADER: cleanText_(request.receiptHeader),
      RECEIPT_FOOTER: cleanText_(request.receiptFooter),
      INVOICE_TERMS: cleanText_(request.invoiceTerms),
      QUOTATION_TERMS: cleanText_(request.quotationTerms),
      ENABLE_BILL_PAYMENT: request.enableBillPayment === false ? 'NO' : 'YES',
      // Keep the POS identification line on every print unless the shop
      // deliberately replaces it with its own text.
      POS_BRAND_FOOTER: current.POS_BRAND_FOOTER || 'SHAN POS SYSTEMS',
      POS_BRAND_FOOTER_ENABLED: current.POS_BRAND_FOOTER_ENABLED || 'NO'
    };
    if(access.identity)fields.CASH_BALANCE_ENABLED=request.cashBalanceEnabled===false?'NO':'YES';
    if(access.identity)fields.PRINT_SHOW_LOGO=request.printShowLogo===false?'NO':'YES';
    if(access.identity||access.permissions.settings===true){
      const mode=cleanText_(request.printPaperMode||current.PRINT_PAPER_MODE).toUpperCase(), allowedModes=['A4','A5','CONTINUOUS','THERMAL_80','THERMAL_58','BLUETOOTH_210'];
      fields.PRINT_PAPER_MODE=allowedModes.indexOf(mode)>=0?mode:(current.PRINT_PAPER_MODE||'A4');
      fields.PRINT_AUTO_CUT_FEED=request.autoCutFeed===false?'NO':'YES';
    }
    Object.keys(fields).forEach(function (key) { setSetting_(ss, key, fields[key]); });
    if(access.identity && activeShopCode_()){
      const shops=shopDatabaseConfig_(), code=activeShopCode_(), record=shops[code]||{};
      record.updatedAt=new Date().toISOString();
      shops[code]=record;saveShopDatabaseConfig_(shops);
      if(fields.BRANCH_MANAGEMENT_ENABLED==='YES'){
        const config=posAccessConfig_();
        (config.accounts||[]).forEach(function(account){if(!account.parentId||['SYSTEM_ADMIN','SUPER_ADMIN','ADMIN'].includes(account.role)){account.permissions=account.permissions||{};account.permissions.branchView=true;}});
        saveAccessConfig_(config);
      }
    }
    if (request.logoDataUrl && access.identity) {
      setSetting_(ss, 'BUSINESS_LOGO_URL', saveLogoFile_(request.logoDataUrl));
    }
    if (request.softwareLogoDataUrl && access.account && access.account.role === 'OWNER') {
      setSetting_(ss, 'SOFTWARE_LOGO_URL', saveLogoFile_(request.softwareLogoDataUrl));
    }
    return publicSettings_(getSettings_(ss));
  });
}

function saveLogoFile_(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Logo upload failed. Please choose a PNG or JPG image.');
  const bytes = AppUtilities.base64Decode(match[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Logo image is too large. Please use an image under 5MB.');
  const ext = match[1].indexOf('png') >= 0 ? '.png' : '.jpg';
  const file = StorageApp.createFile(AppUtilities.newBlob(bytes, match[1], 'shan-pos-logo' + ext));
  return 'drive-file:' + file.getId();
}

function listBillHistory(kind, dateText) {
  const type = cleanText_(kind).toUpperCase();
  const ss = getSpreadsheet_();
  if (type === 'ALL') return []
    .concat(listSaleHistory_(ss, dateText))
    .concat(listPaymentHistory_(ss, dateText))
    .concat(listInvoiceHistory_(ss, dateText))
    .concat(listQuotationHistory_(ss, dateText))
    .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
  if (type === 'PAYMENT') return listPaymentHistory_(ss, dateText);
  if (type === 'INVOICE') return listInvoiceHistory_(ss, dateText);
  if (type === 'QUOTATION') return listQuotationHistory_(ss, dateText);
  return listSaleHistory_(ss, dateText);
}

function historyDateMatch_(value, dateText) {
  const selected = cleanText_(dateText);
  if (!selected) return true;
  return AppUtilities.formatDate(new Date(value), AppSession.getScriptTimeZone(), 'yyyy-MM-dd') === selected;
}

function creditHistoryStatus_(ss, referenceNo, customerPhone, total, dateValue) {
  const ref = cleanText_(referenceNo), phone = cleanText_(customerPhone).replace(/\s+/g, '');
  const out = { creditBalance: 0, paidDate: '', creditColor: '', creditLabel: '' };
  const ledger = ss.getSheetByName(APP.SHEETS.CREDIT_LEDGER);
  if (!ledger || ledger.getLastRow() < 2) return out;
  const rows = ledger.getDataRange().getValues().slice(1);
  const refRows = rows.filter(function (r) { return cleanText_(r[5]) === ref; });
  const relevant = refRows.length ? refRows : rows.filter(function (r) { return cleanText_(r[3]).replace(/\s+/g, '') === phone; });
  if (!relevant.length) return out;
  const credit = relevant.reduce(function (sum, r) { return sum + Number(r[6] || 0); }, 0);
  if (credit <= 0 && Number(total || 0) <= 0) return out;
  const balance = round2_(relevant.reduce(function (sum, r) { return sum + Number(r[8] || 0); }, 0));
  out.creditBalance = Math.max(0, balance);
  const payments = relevant.filter(function (r) { return Number(r[7] || 0) > 0; }).map(function (r) { return new Date(r[0]); }).filter(function (d) { return !isNaN(d); }).sort(function (a, b) { return b - a; });
  if (out.creditBalance <= 0) {
    out.paidDate = payments[0] ? AppUtilities.formatDate(payments[0], AppSession.getScriptTimeZone(), 'yyyy-MM-dd') : '';
    out.creditColor = 'GREEN';
    out.creditLabel = 'PAID' + (out.paidDate ? ' - ' + out.paidDate : '');
    return out;
  }
  const baseDate = new Date(dateValue);
  const days = isNaN(baseDate) ? 0 : Math.floor((new Date() - baseDate) / 86400000);
  out.creditLabel = days + ' days unpaid';
  if (days >= 30) out.creditColor = 'RED';
  else if (days >= 15) out.creditColor = 'YELLOW';
  return out;
}

function chequeHistoryStatus_(ss, referenceNo) {
  const ref = cleanText_(referenceNo);
  if (!ref) return {};
  const sh = ss.getSheetByName(APP.SHEETS.CHEQUE_RECEIPTS);
  if (sh && sh.getLastRow() > 1) {
    const rows = sh.getDataRange().getValues().slice(1);
    const row = rows.reverse().find(function (r) { return cleanText_(r[1]) === ref; });
    if (row) {
      const paid = row[0] ? AppUtilities.formatDate(new Date(row[0]), AppSession.getScriptTimeZone(), 'yyyy-MM-dd') : '';
      return { chequeColor: 'GREEN', chequeLabel: 'CHECK RECEIVED' + (paid ? ' - ' + paid : ''), chequeReceivedDate: paid };
    }
  }
  return { chequeColor: 'YELLOW', chequeLabel: 'CHECK PENDING' };
}

function listSaleHistory_(ss, dateText) {
  const sh = ss.getSheetByName(APP.SHEETS.BILLS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(r=>cleanText_(r[7]).toUpperCase()==='SALE'&&historyDateMatch_(r[1],dateText)).reverse().map(function (r) {
    let data = {}; try { data = JSON.parse(r[3]) || {}; } catch (e) {}
    const status = creditHistoryStatus_(ss, cleanText_(r[0]), cleanText_(r[2]), Number(r[4]||0), r[1]);
    if (!status.creditLabel && Number(data.creditBalance || 0) > 0) status.creditLabel = 'Credit balance';
    const cheque = cleanText_(data.paymentMethod).toUpperCase() === 'CHECK' ? chequeHistoryStatus_(ss, cleanText_(r[0])) : {};
    return Object.assign({ type:'SALE', no:cleanText_(r[0]), date:r[1], customer:cleanText_(data.customerName)||cleanText_(r[2]), amount:Number(r[4]||0), status:cleanText_(r[7])||'SALE', paymentMethod: cleanText_(data.paymentMethod), checkNo: cleanText_(data.checkNo), checkDate: cleanText_(data.checkDate) }, status, cheque);
  });
}

function listPaymentHistory_(ss, dateText) {
  const sh = ss.getSheetByName(APP.SHEETS.PAYMENTS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(r=>cleanText_(r[11]).toUpperCase()!=='RETURN'&&historyDateMatch_(r[1],dateText)).reverse().map(function (r) {
    return { type:cleanText_(r[11])||'PAYMENT', no:cleanText_(r[0]), date:r[1], customer:cleanText_(r[14]) || cleanText_(r[4]), customerMobile:cleanText_(r[4]), customerAddress:cleanText_(r[10]), wallet:cleanText_(r[2]), biller:cleanText_(r[3]), accountNo:cleanText_(r[5]), amount:Number(r[8]||0), serviceCharge:Number(r[7]||0), cardCharge:Number(r[16]||0), refNo:cleanText_(r[9]), checkNo:cleanText_(r[13]), checkDate:'', paymentMethod:cleanText_(r[11])||'PAYMENT', status:cleanText_(r[11])||'PAYMENT' };
  });
}

function listInvoiceHistory_(ss, dateText) {
  const sh = ss.getSheetByName(APP.SHEETS.INVOICES);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(r=>cleanText_(r[0])&&historyDateMatch_(r[1],dateText)).reverse().map(function (r) {
    let data = {}; try { data = JSON.parse(r[4]) || {}; } catch (e) {}
    const status = creditHistoryStatus_(ss, cleanText_(r[0]), cleanText_(r[3]), Number(r[5]||0), r[1]);
    if (!status.creditLabel && Number(data.creditBalance || 0) > 0) status.creditLabel = 'Credit balance';
    const cheque = cleanText_(data.paymentMethod).toUpperCase() === 'CHECK' ? chequeHistoryStatus_(ss, cleanText_(r[0])) : {};
    return Object.assign({ type:'INVOICE', no:cleanText_(r[0]), date:r[1], customer:cleanText_(r[2]) || cleanText_(r[3]), amount:Number(r[5]||0), status:'INVOICE', paymentMethod: cleanText_(data.paymentMethod), checkNo: cleanText_(data.checkNo), checkDate: cleanText_(data.checkDate) }, status, cheque);
  });
}

function listQuotationHistory_(ss, dateText) {
  const sh = ss.getSheetByName(APP.SHEETS.QUOTATIONS);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(r=>cleanText_(r[0])&&historyDateMatch_(r[1],dateText)).reverse().map(function (r) {
    return { type:'QUOTATION', no:cleanText_(r[0]), date:r[1], customer:cleanText_(r[2]) || cleanText_(r[3]), amount:Number(r[8]||0), status:cleanText_(r[10])||'ACTIVE' };
  });
}

function simpleHistoryRows_(ss, sheetName, type, dateText, numberIndex, dateIndex, customerIndex, amountIndex, statusIndex) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(function (r) {
    return cleanText_(r[numberIndex]) && historyDateMatch_(r[dateIndex], dateText);
  }).reverse().map(function (r) {
    return { type:type, no:cleanText_(r[numberIndex]), date:r[dateIndex], customer:cleanText_(r[customerIndex]), amount:amountIndex >= 0 ? Number(r[amountIndex] || 0) : '', status:statusIndex >= 0 ? cleanText_(r[statusIndex]) : type };
  });
}

function listJobNoteHistory_(ss, dateText) { return simpleHistoryRows_(ss, APP.SHEETS.JOB_NOTES, 'JOB_NOTE', dateText, 0, 1, 2, -1, 9); }
function listCctvHistory_(ss, dateText) { return simpleHistoryRows_(ss, 'CCTV Applications', 'CCTV_APPLICATION', dateText, 0, 1, 2, 7, -1); }
function listLoanHistory_(ss, dateText) { return simpleHistoryRows_(ss, APP.SHEETS.LOANS, 'LOAN', dateText, 0, 2, 3, 11, 17); }
function listLoanPaymentHistory_(ss, dateText) { return simpleHistoryRows_(ss, APP.SHEETS.LOAN_PAYMENTS, 'LOAN_PAYMENT', dateText, 0, 2, 1, 3, -1); }
function listMobileServiceHistory_(ss, dateText) { return simpleHistoryRows_(ss, 'Mobile Phone Services', 'MOBILE_SERVICE', dateText, 0, 1, 2, 14, 4); }
function listPurchaseHistory_(ss, dateText) { return simpleHistoryRows_(ss, APP.SHEETS.PURCHASES, 'PURCHASE', dateText, 0, 1, 2, 8, -1); }
function listBankTransactionHistory_(ss, dateText) { return simpleHistoryRows_(ss, BANK_LEDGER_SHEET_, 'BANK_TXN', dateText, 0, 1, 2, 5, -1); }
function listFinanceAssetHistory_(ss, dateText) { return simpleHistoryRows_(ss, FINANCE_LEDGER_SHEET_, 'FINANCE_ASSET', dateText, 0, 4, 1, 5, 11); }
function listFinancePaymentHistory_(ss, dateText) { return simpleHistoryRows_(ss, FINANCE_PAYMENT_SHEET_, 'FINANCE_PAYMENT', dateText, 0, 2, 1, 3, -1); }
function listActivityHistory_(ss, dateText) {
  const sh = ss.getSheetByName(APP.SHEETS.ACTIVITY_LOG);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).filter(function (r) {
    return cleanText_(r[0]) && historyDateMatch_(r[1], dateText);
  }).reverse().map(function (r) {
    return {
      type: 'ACTIVITY',
      no: cleanText_(r[0]),
      date: r[1],
      customer: [cleanText_(r[2]), cleanText_(r[3]), cleanText_(r[6])].filter(Boolean).join(' / '),
      amount: '',
      status: cleanText_(r[4]) || 'ACTIVITY'
    };
  });
}

function listBillHistory(kind, dateText) {
  const type = cleanText_(kind).toUpperCase();
  const ss = getSpreadsheet_();
  const all = []
    .concat(listSaleHistory_(ss, dateText))
    .concat(listPaymentHistory_(ss, dateText))
    .concat(listInvoiceHistory_(ss, dateText))
    .concat(listQuotationHistory_(ss, dateText))
    .concat(listJobNoteHistory_(ss, dateText))
    .concat(listCctvHistory_(ss, dateText))
    .concat(listLoanHistory_(ss, dateText))
    .concat(listLoanPaymentHistory_(ss, dateText))
    .concat(listMobileServiceHistory_(ss, dateText))
    .concat(listPurchaseHistory_(ss, dateText))
    .concat(listBankTransactionHistory_(ss, dateText))
    .concat(listFinanceAssetHistory_(ss, dateText))
    .concat(listFinancePaymentHistory_(ss, dateText))
    .concat(listActivityHistory_(ss, dateText))
    .sort(function (a, b) { return new Date(b.date).getTime() - new Date(a.date).getTime(); });
  if (type === 'ALL') return all;
  if (type === 'SALE') return listSaleHistory_(ss, dateText);
  if (type === 'PAYMENT') return listPaymentHistory_(ss, dateText);
  if (type === 'INVOICE') return listInvoiceHistory_(ss, dateText);
  if (type === 'QUOTATION') return listQuotationHistory_(ss, dateText);
  if (type === 'PURCHASE') return listPurchaseHistory_(ss, dateText);
  if (type === 'BANK_TXN') return listBankTransactionHistory_(ss, dateText);
  if (type === 'FINANCE_ASSET') return listFinanceAssetHistory_(ss, dateText);
  if (type === 'FINANCE_PAYMENT') return listFinancePaymentHistory_(ss, dateText);
  if (type === 'ACTIVITY') return listActivityHistory_(ss, dateText);
  return all.filter(function (row) { return cleanText_(row.type).toUpperCase() === type; });
}

function genericHistoryRecordFromSheet_(ss, no) {
  const wanted = cleanText_(no).toUpperCase();
  if (!wanted) throw new Error('Enter a history number.');
  const sheets = ss.getSheets();
  for (let i = 0; i < sheets.length; i++) {
    const sh = sheets[i];
    if (sh.getLastRow() < 2 || sh.getLastColumn() < 1) continue;
    const values = sh.getDataRange().getValues();
    const headers = values[0].map(cleanText_);
    for (let r = 1; r < values.length; r++) {
      if (cleanText_(values[r][0]).toUpperCase() !== wanted) continue;
      const obj = {};
      headers.forEach(function (h, c) { if (h) obj[h] = values[r][c]; });
      const amount = Number(obj.Total || obj['Total Amount'] || obj.Amount || obj['Package Amount'] || obj['Total Payable'] || obj.Balance || 0);
      return { type:'RESTORED_HISTORY', no:wanted, date:obj['Date & Time'] || obj.Date || values[r][1] || new Date(), customerName:cleanText_(obj['Customer Name'] || obj.Customer || obj['Supplier / Company'] || ''), customerPhone:cleanText_(obj.Phone || obj['Customer Phone'] || obj['Phone Number'] || ''), customerAddress:cleanText_(obj.Address || obj['Customer Address'] || ''), items:[{name:sh.getName(), qty:1, unitPrice:amount, lineDiscount:0, lineTotal:amount, warranty:cleanText_(obj.Warranty || obj['Warranty Period'] || ''), serial:cleanText_(obj['Serial Number'] || obj.Serial || obj.IMEI || '')}], subtotal:amount, total:amount, paymentMethod:cleanText_(obj.Payment || obj['Payment Method'] || obj.Status || ''), note:JSON.stringify(obj), settings:publicSettings_(getSettings_(ss))};
    }
  }
  throw new Error('History record not found: ' + wanted);
}

function getHistoryRecordForPrint(request) {
  const type = cleanText_(request && request.type).toUpperCase(), no = cleanText_(request && request.no);
  const ss = getSpreadsheet_();
  try {
    if (type === 'PAYMENT' || type === 'PAYMENT_RETURN') return findPayment(no);
    if (type === 'INVOICE') return findInvoice(no);
    if (type === 'QUOTATION') return findQuotation(no);
    if (type === 'SALE') return findBill(no);
    if (type === 'PURCHASE') {
      const sh = ss.getSheetByName(APP.SHEETS.PURCHASES);
      if (!sh || sh.getLastRow() < 2) throw new Error('Purchase not found.');
      const row = sh.getDataRange().getValues().slice(1).reverse().find(function (r) { return cleanText_(r[0]).toUpperCase() === no; });
      if (!row) throw new Error('Purchase not found.');
      return { type: 'PURCHASE', no: cleanText_(row[0]), date: row[1], customerName: cleanText_(row[2]), customerPhone: cleanText_(row[3]), customerAddress: '', items: [{ name: cleanText_(row[4])+' - '+cleanText_(row[5]), qty: Number(row[6]||0), unitPrice: Number(row[7]||0), lineDiscount: 0, lineTotal: Number(row[8]||0), warranty: '', serial: '' }], subtotal: Number(row[8]||0), total: Number(row[8]||0), paymentMethod: 'PURCHASE', note: cleanText_(row[9]), settings: publicSettings_(getSettings_(ss)) };
    }
    if (type === 'BANK_TXN') {
      const sh = ss.getSheetByName(BANK_LEDGER_SHEET_);
      if (!sh || sh.getLastRow() < 2) throw new Error('Bank transaction not found.');
      const row = sh.getDataRange().getValues().slice(1).reverse().find(function (r) { return cleanText_(r[0]).toUpperCase() === no; });
      if (!row) throw new Error('Bank transaction not found.');
      return { type:'BANK_TXN', no:cleanText_(row[0]), date:row[1], customerName:cleanText_(row[2]), customerPhone:'', customerAddress:cleanText_(row[6]), items:[{name:cleanText_(row[4])+' - '+cleanText_(row[3]), qty:1, unitPrice:Number(row[5]||0), lineDiscount:0, lineTotal:Number(row[5]||0), warranty:'', serial:''}], subtotal:Number(row[5]||0), total:Number(row[5]||0), paymentMethod:cleanText_(row[4]), note:cleanText_(row[6]), settings: publicSettings_(getSettings_(ss)) };
    }
    if (type === 'FINANCE_ASSET') {
      const sh = ss.getSheetByName(FINANCE_LEDGER_SHEET_);
      if (!sh || sh.getLastRow() < 2) throw new Error('Finance record not found.');
      const row = sh.getDataRange().getValues().slice(1).reverse().find(function (r) { return cleanText_(r[0]).toUpperCase() === no; });
      if (!row) throw new Error('Finance record not found.');
      return { type:'FINANCE_ASSET', no:cleanText_(row[0]), date:row[4], customerName:cleanText_(row[1]), customerPhone:'', customerAddress:cleanText_(row[12]), items:[{name:cleanText_(row[2])+' / '+cleanText_(row[3]), qty:1, unitPrice:Number(row[5]||0), lineDiscount:Number(row[6]||0), lineTotal:Number(row[5]||0), warranty:'', serial:''}], subtotal:Number(row[5]||0), total:Number(row[5]||0), paymentMethod:cleanText_(row[11]), note:'Balance: '+cleanText_(row[10]), settings: publicSettings_(getSettings_(ss)) };
    }
    if (type === 'FINANCE_PAYMENT') {
      const sh = ss.getSheetByName(FINANCE_PAYMENT_SHEET_);
      if (!sh || sh.getLastRow() < 2) throw new Error('Finance payment not found.');
      const row = sh.getDataRange().getValues().slice(1).reverse().find(function (r) { return cleanText_(r[0]).toUpperCase() === no; });
      if (!row) throw new Error('Finance payment not found.');
      return { type:'FINANCE_PAYMENT', no:cleanText_(row[0]), date:row[2], customerName:cleanText_(row[1]), customerPhone:'', customerAddress:cleanText_(row[4]), items:[{name:'Finance installment payment', qty:1, unitPrice:Number(row[3]||0), lineDiscount:0, lineTotal:Number(row[3]||0), warranty:'', serial:''}], subtotal:Number(row[3]||0), total:Number(row[3]||0), paymentMethod:'FINANCE PAYMENT', note:cleanText_(row[4]), settings: publicSettings_(getSettings_(ss)) };
    }
    if (type === 'ACTIVITY') {
      const sh = ss.getSheetByName(APP.SHEETS.ACTIVITY_LOG);
      if (!sh || sh.getLastRow() < 2) throw new Error('Activity record not found.');
      const row = sh.getDataRange().getValues().slice(1).reverse().find(function (r) { return cleanText_(r[0]).toUpperCase() === no; });
      if (!row) throw new Error('Activity record not found.');
      const itemTitle = [cleanText_(row[2]), cleanText_(row[3]), cleanText_(row[4])].filter(Boolean).join(' - ');
      return { type: 'ACTIVITY', no: cleanText_(row[0]), date: row[1], customerName: cleanText_(row[6]) || cleanText_(row[8]), customerPhone: '', customerAddress: cleanText_(row[7]), items: [{ name: itemTitle || cleanText_(row[6]) || 'Activity', qty: 1, unitPrice: 0, lineDiscount: 0, lineTotal: 0, warranty: '', serial: cleanText_(row[5]) }], subtotal: 0, total: 0, paymentMethod: cleanText_(row[3]) || cleanText_(row[2]), note: cleanText_(row[7]), settings: publicSettings_(getSettings_(ss)) };
    }
  } catch (e) {
    // Restored/old backups may not have the exact current sheet format. Fall through
    // to the generic preview so the record can still be viewed and printed.
  }
  return genericHistoryRecordFromSheet_(ss, no);
}

function saveGlobalShanPosManagement_(settings){
  const props=AppProperties.getScriptProperties();
  ['SOFTWARE_LOGO_URL','POS_BRAND_FOOTER','POS_BRAND_FOOTER_ENABLED','PRINT_PAPER_MODE','PRINT_AUTO_CUT_FEED'].forEach(function(key){
    if(settings&&settings[key]!==undefined&&settings[key]!==null)props.setProperty('GLOBAL_'+key,String(settings[key]));
  });
}
function globalShanPosManagement_(){
  const props=AppProperties.getScriptProperties();
  return {
    SOFTWARE_LOGO_URL: cleanText_(props.getProperty('GLOBAL_SOFTWARE_LOGO_URL')),
    SOFTWARE_LOGO_DATA: cleanText_(props.getProperty('GLOBAL_SOFTWARE_LOGO_DATA')),
    POS_BRAND_FOOTER: cleanText_(props.getProperty('GLOBAL_POS_BRAND_FOOTER')),
    POS_BRAND_FOOTER_ENABLED: cleanText_(props.getProperty('GLOBAL_POS_BRAND_FOOTER_ENABLED')),
    PRINT_PAPER_MODE: cleanText_(props.getProperty('GLOBAL_PRINT_PAPER_MODE')),
    PRINT_AUTO_CUT_FEED: cleanText_(props.getProperty('GLOBAL_PRINT_AUTO_CUT_FEED'))
  };
}
function publicSettings_(settings) {
  const activeShop=activeShopCode_(), activeRecord=activeShop?shopRecordForCode_(activeShop)||{}:{};
  const globalMgmt=globalShanPosManagement_();
  const licenseState=activeShop?shopLicenseAccessState_(activeRecord):{licenseType:'MASTER',licenseTier:'MASTER',licenseTierDays:0,licenseExpiresAt:'',licenseDaysRemaining:0,licenseLocked:false};
  return { businessName: settings.BUSINESS_NAME || APP.DEFAULTS.BUSINESS_NAME,
    registrationNo: settings.BUSINESS_REG_NO || '',
    phoneLine1: settings.BUSINESS_PHONE_LINE1 || '', phoneLine2: settings.BUSINESS_PHONE_LINE2 || '',
    address1: settings.BUSINESS_ADDRESS1 || '', address2: settings.BUSINESS_ADDRESS2 || '',
    address3: settings.BUSINESS_ADDRESS3 || '', currency: settings.CURRENCY || APP.DEFAULTS.CURRENCY,
    email: settings.BUSINESS_EMAIL || '', website: settings.BUSINESS_WEBSITE || '',
    logoUrl: logoDataUrl_(settings.BUSINESS_LOGO_URL || ''),
    // Prefer the protected data copy so the owner logo survives new
    // deployments even when the previous Drive file cannot be resolved.
    softwareLogoUrl: globalMgmt.SOFTWARE_LOGO_DATA || logoDataUrl_(globalMgmt.SOFTWARE_LOGO_URL || settings.SOFTWARE_LOGO_URL || ''),
    receiptHeader: settings.RECEIPT_HEADER || '',
    receiptFooter: settings.RECEIPT_FOOTER || 'Thank you!',
    // DOCUMENT_TERMS is retained as the fallback for shops configured before
    // invoice and quotation terms became separate fields.
    documentTerms: settings.DOCUMENT_TERMS || '',
    invoiceTerms: settings.INVOICE_TERMS || settings.DOCUMENT_TERMS || '',
    quotationTerms: settings.QUOTATION_TERMS || settings.DOCUMENT_TERMS || '',
    businessMode: settings.BUSINESS_MODE || cleanText_((activeRecord.customerDetails||{}).businessType) || 'SINGLE_SHOP',
    softwareVersion: softwareUpdateNotice_().version || 'SHAN POS SYSTEMS',
    licenseType: licenseState.licenseType,
    licenseTier: licenseState.licenseTier,
    licenseTierDays: licenseState.licenseTierDays,
    licenseExpiresAt: licenseState.licenseExpiresAt,
    licenseDaysRemaining: licenseState.licenseDaysRemaining,
    licenseLocked: licenseState.licenseLocked,
    branchManagementEnabled: String(settings.BRANCH_MANAGEMENT_ENABLED || 'NO').toUpperCase() === 'YES',
    mainBranchName: settings.MAIN_BRANCH_NAME || cleanText_((activeRecord.customerDetails||{}).firstBranchName),
    enableBillPayment: String(settings.ENABLE_BILL_PAYMENT || 'YES').toUpperCase() !== 'NO',
    cashBalanceEnabled: String(settings.CASH_BALANCE_ENABLED || 'YES').toUpperCase() !== 'NO',
    printShowLogo: String(settings.PRINT_SHOW_LOGO || 'YES').toUpperCase() !== 'NO',
    posBrandFooter: globalMgmt.POS_BRAND_FOOTER || settings.POS_BRAND_FOOTER || 'SHAN POS SYSTEMS',
    posBrandFooterEnabled: String(globalMgmt.POS_BRAND_FOOTER_ENABLED || settings.POS_BRAND_FOOTER_ENABLED || 'NO').toUpperCase() === 'YES',
    printPaperMode: globalMgmt.PRINT_PAPER_MODE || settings.PRINT_PAPER_MODE || 'A4',
    printAutoCutFeed: String(globalMgmt.PRINT_AUTO_CUT_FEED || settings.PRINT_AUTO_CUT_FEED || 'YES').toUpperCase() !== 'NO',
    invoicePrefix: settings.INVOICE_PREFIX || APP.DEFAULTS.INVOICE_PREFIX };
}

function softwareUpdateNotice_() {
  const props = AppProperties.getScriptProperties();
  return {
    title: cleanText_(props.getProperty('POS_RELEASE_TITLE')) || 'Software Update',
    version: cleanText_(props.getProperty('POS_RELEASE_VERSION')) || '',
    message: cleanText_(props.getProperty('POS_RELEASE_MESSAGE')) || '',
    updatedAt: cleanText_(props.getProperty('POS_RELEASE_UPDATED_AT')) || '',
    active: String(props.getProperty('POS_RELEASE_ACTIVE') || 'NO').toUpperCase() === 'YES'
  };
}

function getSoftwareUpdateNotice() {
  return softwareUpdateNotice_();
}

function saveSoftwareUpdateNotice(request) {
  setActiveShop_('');
  const actor = accountForPin_(request && request.actorPin);
  if (!actor || actor.role !== 'OWNER' || activeShopCode_()) throw new Error('Only the Master Owner on the Master page can publish update notices.');
  const title = cleanText_(request && request.title) || 'Software Update';
  const version = cleanText_(request && request.version);
  const message = cleanText_(request && request.message);
  const active = String(request && request.active).toUpperCase() !== 'NO';
  AppProperties.getScriptProperties().setProperties({
    POS_RELEASE_TITLE: title,
    POS_RELEASE_VERSION: version,
    POS_RELEASE_MESSAGE: message,
    POS_RELEASE_UPDATED_AT: new Date().toISOString(),
    POS_RELEASE_ACTIVE: active ? 'YES' : 'NO'
  }, true);
  return softwareUpdateNotice_();
}

function mobileServiceHeaders_() { return ['Application No','Date & Time','Customer Name','Phone','Section','Job Type','Item / Phone Model','Stock Item ID','Serial Number','IMEI Number','Warranty Period','Qty','Price','Discount','Total','Note','Conditions / Warranty Note','Created By','Shop Code']; }
function saveMobileServiceApplication(request) {
  const actor = requirePermission_(request && request.actorPin, 'mobileService');
  const section = cleanText_(request && request.section) || 'SALE';
  const jobType = cleanText_(request && request.jobType) || 'Mobile Phone Service';
  const itemName = cleanText_(request && request.itemName);
  const stockItemId = cleanText_(request && request.stockItemId);
  const qty = Math.max(1, Number(request && request.qty || 1));
  const price = nonNegative_(request && request.price, 'Price');
  const discount = nonNegative_(request && request.discount, 'Discount');
  const total = round2_(Math.max(0, qty * price - discount));
  if (!itemName && !stockItemId) throw new Error('Enter or select the phone/item/service.');
  return withLock_(function () {
    const ss = getSpreadsheet_(), sh = getOrCreateSheet_(ss, 'Mobile Phone Services');
    ensureHeaders_(sh, mobileServiceHeaders_());
    const no = 'MOB-' + AppUtilities.getUuid().slice(0, 8).toUpperCase(), now = new Date();
    sh.appendRow([no, now, cleanText_(request && request.customerName), cleanText_(request && request.phone), section, jobType, itemName, stockItemId, cleanText_(request && request.serialNumber), cleanText_(request && request.imeiNumber), cleanText_(request && request.warrantyPeriod), qty, price, discount, total, cleanText_(request && request.note), cleanText_(request && request.conditionsNote), actor.name, activeShopCode_() || 'MASTER']);
    return { applicationNo:no, date:now.toISOString(), section:section, jobType:jobType, itemName:itemName, stockItemId:stockItemId, serialNumber:cleanText_(request && request.serialNumber), imeiNumber:cleanText_(request && request.imeiNumber), warrantyPeriod:cleanText_(request && request.warrantyPeriod), qty:qty, price:price, discount:discount, total:total, note:cleanText_(request && request.note), conditionsNote:cleanText_(request && request.conditionsNote), settings:settingsObject_(ss) };
  });
}

const SHAN_OWNER_OPERATIONS_PROPERTY_ = 'SHAN_POS_OWNER_BRANCH_STAFF_WORK';
const SHAN_OWNER_STAFF_PERMISSION_KEYS_ = Object.freeze(['customerSoftwareManagement','customerSupport','usernamePinTools','ownerBranchStaff','softwareLogoFooter','globalUpdateNotice','deploymentAssist','permissionApproval','reportsView','workAssignment']);
function shanOwnerOnly_(pin) {
  const actor = accountForPin_(pin);
  if (!actor || actor.role !== 'OWNER' || activeShopCode_()) throw new Error('Only the SHAN POS Software Owner can manage this section.');
  return actor;
}
function shanOwnerOperations_() {
  try {
    const parsed = JSON.parse(AppProperties.getScriptProperties().getProperty(SHAN_OWNER_OPERATIONS_PROPERTY_) || '{}');
    return {branches:Array.isArray(parsed.branches)?parsed.branches:[], staff:Array.isArray(parsed.staff)?parsed.staff:[], tasks:Array.isArray(parsed.tasks)?parsed.tasks:[]};
  } catch (e) {
    return {branches:[], staff:[], tasks:[]};
  }
}
function saveShanOwnerOperations_(data) {
  AppProperties.getScriptProperties().setProperty(SHAN_OWNER_OPERATIONS_PROPERTY_, JSON.stringify(data || {branches:[], staff:[], tasks:[]}));
}
function getShanOwnerOperations(actorPin) {
  shanOwnerOnly_(actorPin);
  return shanOwnerOperations_();
}
function saveShanOwnerBranch(request) {
  const actor = shanOwnerOnly_(request && request.actorPin), name = cleanText_(request && request.name);
  if (!name) throw new Error('Enter branch name.');
  return withLock_(function () {
    const data = shanOwnerOperations_(), id = cleanText_(request && request.id) || ('OWNER-BR-' + AppUtilities.getUuid().slice(0, 8).toUpperCase());
    let row = data.branches.find(function (x) { return x.id === id; });
    if (!row) { row = {id:id, createdAt:new Date().toISOString()}; data.branches.push(row); }
    row.name = name;
    row.location = cleanText_(request && request.location);
    row.phone = cleanText_(request && request.phone);
    row.note = cleanText_(request && request.note);
    row.active = request && request.active === false ? false : true;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    saveShanOwnerOperations_(data);
    return data;
  });
}
function saveShanOwnerStaff(request) {
  const actor = shanOwnerOnly_(request && request.actorPin), name = cleanText_(request && request.name);
  if (!name) throw new Error('Enter staff name.');
  return withLock_(function () {
    const data = shanOwnerOperations_(), id = cleanText_(request && request.id) || ('OWNER-ST-' + AppUtilities.getUuid().slice(0, 8).toUpperCase());
    let row = data.staff.find(function (x) { return x.id === id; });
    if (!row) { row = {id:id, createdAt:new Date().toISOString()}; data.staff.push(row); }
    row.name = name;
    row.branchId = cleanText_(request && request.branchId);
    row.role = cleanText_(request && request.role);
    row.phone = cleanText_(request && request.phone);
    row.note = cleanText_(request && request.note);
    row.permissions = {};
    const submitted = request && request.permissions && typeof request.permissions === 'object' ? request.permissions : {};
    SHAN_OWNER_STAFF_PERMISSION_KEYS_.forEach(function (key) { row.permissions[key] = submitted[key] === true; });
    row.active = request && request.active === false ? false : true;
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    saveShanOwnerOperations_(data);
    return data;
  });
}
function saveShanOwnerTask(request) {
  const actor = shanOwnerOnly_(request && request.actorPin), title = cleanText_(request && request.title);
  if (!title) throw new Error('Enter work title.');
  return withLock_(function () {
    const data = shanOwnerOperations_(), id = cleanText_(request && request.id) || ('OWNER-WORK-' + AppUtilities.getUuid().slice(0, 8).toUpperCase());
    let row = data.tasks.find(function (x) { return x.id === id; });
    if (!row) { row = {id:id, createdAt:new Date().toISOString()}; data.tasks.push(row); }
    row.title = title;
    row.branchId = cleanText_(request && request.branchId);
    row.staffId = cleanText_(request && request.staffId);
    row.status = cleanText_(request && request.status) || 'PENDING';
    row.note = cleanText_(request && request.note);
    row.updatedAt = new Date().toISOString();
    row.updatedBy = actor.name;
    saveShanOwnerOperations_(data);
    return data;
  });
}

/** Reads the logo through Apps Script and returns an embedded image. This works even when Drive links are blocked in the user's browser. */
function logoDataUrl_(value) {
  const url = cleanText_(value);
  const match = url.match(/^drive-file:(.+)$|[?&]id=([^&]+)|\/d\/([^/?]+)/);
  const id = match && (match[1] || match[2] || match[3]);
  if (!id) return '';
  try {
    const blob = StorageApp.getFileById(id).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + AppUtilities.base64Encode(blob.getBytes());
  } catch (e) { return ''; }
}

function nextBillNo_(settings) {
  const next = Math.max(1, Number(settings.NEXT_BILL_NUMBER || APP.DEFAULTS.NEXT_BILL_NUMBER));
  return (settings.INVOICE_PREFIX || APP.DEFAULTS.INVOICE_PREFIX) + String(next).padStart(4, '0');
}
function nextInvoiceNo_(settings) {
  const next = Math.max(1, Number(settings.NEXT_INVOICE_NUMBER || APP.DEFAULTS.NEXT_INVOICE_NUMBER));
  return (settings.INVOICE_PREFIX || APP.DEFAULTS.INVOICE_PREFIX) + String(next).padStart(4, '0') + 'INV';
}
function nextPaymentNo_(settings) {
  const next = Math.max(1, Number(settings.NEXT_PAYMENT_NUMBER || APP.DEFAULTS.NEXT_PAYMENT_NUMBER));
  return (settings.INVOICE_PREFIX || APP.DEFAULTS.INVOICE_PREFIX) + String(next).padStart(4, '0') + 'PAY';
}

/*
 * Supabase PostgreSQL storage adapter
 * -----------------------------------
 * The original POS business logic is retained. This adapter keeps the
 * spreadsheet-like API used by that logic while persisting every shop's data
 * in Supabase PostgreSQL. The legacy source remains in the
 * original source ZIP outside this deployable build.
 */
const SUPABASE_ROOT_COLLECTION_='billingSheets';
const POS_SHOP_DATABASES_PROPERTY_='POS_SHOP_DATABASES';
const POS_ACTIVE_SHOP_CACHE_PREFIX_='POS_ACTIVE_SHOP_';
function getSpreadsheet_(){return new SupabaseSpreadsheet_();}
function sharedStockSheet_(name){return name===APP.SHEETS.INVOICE_STOCK?APP.SHEETS.STOCK:name;}
function getSheet_(ss,name){const actual=sharedStockSheet_(name);return ss.getSheetByName(actual)||ss.insertSheet(actual);}
function getOrCreateSheet_(ss,name){return getSheet_(ss,name);}
function SupabaseSpreadsheet_(){}
SupabaseSpreadsheet_.prototype.getSheetByName=function(name){name=sharedStockSheet_(name);return new SupabaseSheet_(name)};
SupabaseSpreadsheet_.prototype.insertSheet=function(name){return new SupabaseSheet_(sharedStockSheet_(name))};
function SupabaseSheet_(name){this.name_=name;}
SupabaseSheet_.prototype.getLastRow=function(){return this.getDataRange().getValues().length;};
SupabaseSheet_.prototype.getLastColumn=function(){const v=this.getDataRange().getValues();return v.length?v[0].length:0;};
SupabaseSheet_.prototype.getDataRange=function(){return new SupabaseRange_(this,1,1,null,null)};
SupabaseSheet_.prototype.getRange=function(row,column,numRows,numColumns){return new SupabaseRange_(this,row,column,numRows||1,numColumns||1)};
SupabaseSheet_.prototype.appendRow=function(values){const meta=supabaseReadDocument_(supabaseSheetPath_(this.name_))||{headers:[],nextRow:2};const row=Math.max(2,Number(meta.nextRow||2));supabaseWriteDocument_(supabaseRowPath_(this.name_,row),{row:row,values:(values||[]).map(supabaseSafeValue_)},false);meta.nextRow=row+1;supabaseWriteDocument_(supabaseSheetPath_(this.name_),meta,false);return this};
function SupabaseRange_(sheet,row,column,numRows,numColumns){this.sheet_=sheet;this.row_=row;this.column_=column;this.numRows_=numRows;this.numColumns_=numColumns;}
SupabaseRange_.prototype.getValues=function(){const meta=supabaseReadDocument_(supabaseSheetPath_(this.sheet_.name_))||{headers:[]};const all=[Array.isArray(meta.headers)?meta.headers:[]].concat(supabaseListRows_(this.sheet_.name_).map(r=>r.values||[]));const rows=this.numRows_===null?all.slice(this.row_-1):all.slice(this.row_-1,this.row_-1+this.numRows_);const width=this.numColumns_===null?Math.max.apply(null,[0].concat(all.map(r=>r.length))):this.numColumns_;return rows.map(r=>{const out=[];for(let i=0;i<width;i++)out.push(r[(this.column_-1)+i]===undefined?'':r[(this.column_-1)+i]);return out});};
SupabaseRange_.prototype.getValue=function(){const v=this.getValues();return v.length&&v[0].length?v[0][0]:''};
SupabaseRange_.prototype.setValue=function(v){return this.setValues([[v]])};
SupabaseRange_.prototype.setValues=function(values){const sheet=this.sheet_,meta=supabaseReadDocument_(supabaseSheetPath_(sheet.name_))||{headers:[],nextRow:2};(values||[]).forEach((source,offset)=>{const rowNumber=this.row_+offset;if(rowNumber===1){const headers=Array.isArray(meta.headers)?meta.headers.slice():[];(source||[]).forEach((value,c)=>{headers[this.column_-1+c]=supabaseSafeValue_(value)});meta.headers=headers}else{const existing=supabaseReadDocument_(supabaseRowPath_(sheet.name_,rowNumber))||{row:rowNumber,values:[]};const row=Array.isArray(existing.values)?existing.values.slice():[];(source||[]).forEach((value,c)=>{row[this.column_-1+c]=supabaseSafeValue_(value)});supabaseWriteDocument_(supabaseRowPath_(sheet.name_,rowNumber),{row:rowNumber,values:row},false);meta.nextRow=Math.max(Number(meta.nextRow||2),rowNumber+1)}});supabaseWriteDocument_(supabaseSheetPath_(sheet.name_),meta,false);return this};
function supabaseTenant_(){return normaliseShopCode_(activeShopCode_())||'MASTER';}
function supabaseSheetPath_(name){return SUPABASE_ROOT_COLLECTION_+'/'+supabaseTenant_()+'/'+String(name).replace(/[^A-Za-z0-9 _-]/g,'_');}
function supabaseRowPath_(name,row){return supabaseSheetPath_(name)+'/rows/r'+String(row).padStart(12,'0');}
function supabaseProjectId_(){return cleanText_(process.env.SUPABASE_URL||AppProperties.getScriptProperties().getProperty('SUPABASE_URL')||'SUPABASE');}
function supabaseRequest_(method,table,query,body){const base=env_('SUPABASE_URL').replace(/\/$/,'')+'/rest/v1/'+table;const url=base+(query?'?'+query:'');const args=['-sS','-X',method,url,'-H','apikey: '+env_('SUPABASE_SERVICE_ROLE_KEY'),' -H','Authorization: Bearer '+env_('SUPABASE_SERVICE_ROLE_KEY'),' -H','Content-Type: application/json',' -H','Prefer: resolution=merge-duplicates,return=representation'];const flat=[];args.forEach(x=>{if(x.indexOf(' -H')===0)flat.push(x.trim());else flat.push(x)});if(body!==undefined&&body!==null){flat.push('--data-binary',JSON.stringify(body))}try{const out=execFileSync('curl',flat,{encoding:'utf8',maxBuffer:50*1024*1024});return out?JSON.parse(out):[]}catch(e){throw new Error('Supabase request failed: '+(e.stderr||e.message||String(e)))} }
function supabaseReadDocument_(path){const rows=supabaseRequest_('GET','documents','path=eq.'+encodeURIComponent(path)+'&select=data');return rows&&rows.length?rows[0].data:null}
function supabaseWriteDocument_(path,obj,createOnly){if(createOnly&&supabaseReadDocument_(path))return supabaseReadDocument_(path);const rows=supabaseRequest_('POST','documents','on_conflict=path',[{path:path,data:obj,updated_at:new Date().toISOString()}]);return rows&&rows.length?rows[0].data:obj}
function supabaseDeleteDocument_(path){supabaseRequest_('DELETE','documents','path=eq.'+encodeURIComponent(path));return true}
function supabaseListRows_(name){const pre=supabaseSheetPath_(name)+'/rows/';const rows=supabaseRequest_('GET','documents','path=like.'+encodeURIComponent(pre+'%')+'&select=data');return(rows||[]).map(x=>x.data).sort((a,b)=>Number(a.row||0)-Number(b.row||0))}
function supabaseSafeValue_(v){return v instanceof Date?v.toISOString():v}
function shopDatabaseConfig_(){const raw=AppProperties.getScriptProperties().getProperty(POS_SHOP_DATABASES_PROPERTY_);if(raw){try{const x=JSON.parse(raw);if(x&&typeof x==='object'&&!Array.isArray(x))return x}catch(e){}}try{const d=supabaseReadDocument_('MASTER/Shop Registry');return d&&d.shops&&typeof d.shops==='object'?d.shops:{}}catch(e){return {}}}
function configureSupabase_(url,key){AppProperties.getScriptProperties().setProperty('SUPABASE_URL',cleanText_(url));AppProperties.getScriptProperties().setProperty('SUPABASE_SERVICE_ROLE_KEY',cleanText_(key));return{configured:true}}
function getDatabaseSetupStatus(shopCode){const configured=!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),shop=normaliseShopCode_(shopCode&&typeof shopCode==='object'?shopCode.shopCode:shopCode);if(shop){const r=shopRecordForCode_(shop);if(!shopRecordIsActive_(r)){setActiveShop_('');return{configured:configured,projectId:configured?supabaseProjectId_():'',shopCode:shop,multiShop:true,accessBlocked:true,deleted:true,message:'This shop link has been deleted or disabled.'}}setActiveShop_(shop);return{configured:configured,projectId:configured?supabaseProjectId_():'',shopCode:shop,shopName:cleanText_(r.shopName)||shop,multiShop:true,accessBlocked:false}}setActiveShop_('');return{configured:configured,projectId:configured?supabaseProjectId_():'',shopCode:'DEFAULT',multiShop:true,accessBlocked:false}}

function normaliseShopCode_(value){return cleanText_(value).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,40);}
function cleanDriveFolderId_(value){let text=cleanText_(value);const m=text.match(/\/folders\/([A-Za-z0-9_-]+)/)||text.match(/[?&]id=([A-Za-z0-9_-]+)/);if(m)text=m[1];return text.replace(/[^A-Za-z0-9_-]/g,'').slice(0,120);}
function mergeShopRegistrySources_(shops){return shops&&typeof shops==='object'?shops:shopDatabaseConfig_();}
function saveShopDatabaseConfig_(shops){const next=shops&&typeof shops==='object'?shops:{};AppProperties.getScriptProperties().setProperty(POS_SHOP_DATABASES_PROPERTY_,JSON.stringify(next));AppProperties.getScriptProperties().setProperty('POS_SHOP_DATABASES_ARCHIVE',JSON.stringify(next));try{supabaseWriteDocument_('MASTER/Shop Registry',{updatedAt:new Date().toISOString(),shops:next},false)}catch(e){}}
function purgeDeletedShopScopedState_(shop) {
  const code = normaliseShopCode_(shop);
  if (!code) return;
  const props = AppProperties.getScriptProperties();
  props.deleteProperty('POS_ACCESS_CONFIG_SHOP_' + code);
  props.deleteProperty('POS_CUSTOMER_BRANCHES_' + code);
  props.deleteProperty('POS_CUSTOMER_REQUESTS_' + code);
  const day = AppUtilities.formatDate(new Date(), 'Asia/Colombo', 'yyyy-MM-dd');
  props.deleteProperty('POS_OPENING_BALANCE_' + code + '_' + day);
  props.deleteProperty('POS_CLOSING_BALANCE_' + code + '_' + day);
  try {
    let rows = JSON.parse(props.getProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_) || '[]');
    if (Array.isArray(rows)) {
      const filtered = rows.filter(function(row) { return normaliseShopCode_(row && row.shopCode) !== code; });
      if (filtered.length !== rows.length) props.setProperty(FEATURE_PERMISSION_REQUESTS_PROPERTY_, JSON.stringify(filtered));
    }
  } catch (e) {}
}
const __shanDeleteShopOriginal=deleteShopLinkFromMaster;
deleteShopLinkFromMaster=function(request){const result=__shanDeleteShopOriginal(request);if(result&&result.shopCode){const props=AppProperties.getScriptProperties(),raw=props.getProperty('POS_DELETED_SHOP_CODES');let deleted={};try{deleted=JSON.parse(raw||'{}')}catch(e){deleted={}}deleted[result.shopCode]=new Date().toISOString();props.setProperty('POS_DELETED_SHOP_CODES',JSON.stringify(deleted));}return result;};
function shopRecordForCode_(shopCode){const shop=normaliseShopCode_(shopCode),shops=shopDatabaseConfig_();if(!shop)return null;if(shops[shop])return shops[shop];const hit=Object.keys(shops).find(k=>normaliseShopCode_(shops[k]&&shops[k].softwareCode)===shop);return hit?shops[hit]:null;}
function shopRecordIsActive_(record){if(!record||typeof record!=='object')return false;const status=cleanText_(record.status).toUpperCase();return record.active!==false&&record.deleted!==true&&!['DELETED','REMOVED','DISABLED','INACTIVE'].includes(status);}
function assertShopLinkActive_(shopCode, token){const shop=normaliseShopCode_(shopCode),record=shopRecordForCode_(shop);if(shop&&!shopRecordIsActive_(record)){if(token)AppCache.getScriptCache().remove(cleanText_(token));throw new Error('This shop link has been deleted or disabled. Ask the Master Owner for a new link.');}return record;}
function activeShopCacheKey_(){const key=cleanText_(AppSession.getTemporaryActiveUserKey&&AppSession.getTemporaryActiveUserKey());return POS_ACTIVE_SHOP_CACHE_PREFIX_+(key||'anonymous');}
function setActiveShop_(shopCode){const shop=normaliseShopCode_(shopCode),cache=AppCache.getScriptCache();if(shop)cache.put(activeShopCacheKey_(),shop,21600);else cache.remove(activeShopCacheKey_());}
function activeShopCode_(){return normaliseShopCode_(AppCache.getScriptCache().get(activeShopCacheKey_()));}
function getSettings_(ss) { const rows = getSheet_(ss, APP.SHEETS.SETTINGS).getDataRange().getValues(); const out = {}; rows.slice(1).forEach(function (r) { if (cleanText_(r[0])) out[cleanText_(r[0])] = r[1]; }); return out; }
function setSetting_(ss, key, value) { const sheet = getSheet_(ss, APP.SHEETS.SETTINGS); const rows = sheet.getDataRange().getValues(); const i = rows.findIndex(function (r) { return cleanText_(r[0]) === key; }); if (i < 0) sheet.appendRow([key, value]); else sheet.getRange(i + 1, 2).setValue(value); }
function ensureHeaders_(sheet, headers) { if (sheet.getLastRow() === 0) { sheet.appendRow(headers); return; } const current = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(cleanText_); headers.forEach(function (header) { if (!current.includes(header)) { sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header); current.push(header); } }); }
function billHeaders_() { return ['Bill No', 'Date & Time', 'Customer Phone', 'Items (JSON)', 'Total', 'Cost Total', 'Profit', 'Type', 'Related Bill']; }
function invoiceHeaders_() { return ['Invoice No', 'Date & Time', 'Customer Name', 'Customer Phone', 'Items (JSON)', 'Total', 'Cost Total', 'Profit', 'Customer Address']; }
function customerHeaders_() { return ['Customer ID', 'Customer Name', 'Customer Phone', 'Customer Address', 'Email', 'Notes', 'Updated At']; }
function creditCustomerHeaders_() { return ['Customer Key', 'Customer Name', 'Customer Phone', 'Credit Limit', 'Created At']; }
function creditLedgerHeaders_() { return ['Date & Time', 'Customer Key', 'Customer Name', 'Customer Phone', 'Type', 'Reference No', 'Credit Amount', 'Payment Amount', 'Balance Change', 'Notes']; }
function paymentHeaders_() { return ['Receipt No', 'Date & Time', 'Wallet', 'Service / Biller', 'Customer Mobile', 'Account No', 'Amount', 'Service Charge', 'Total Amount', 'Ref No', 'Customer Address', 'Transaction Type', 'Related Receipt', 'Bank Account', 'Customer Name', 'Customer ID', 'Card Charge', 'Card Charge %']; }
function withLock_(work) { const lock = AppLock.getScriptLock(); lock.waitLock(30000); try { return work(); } finally { lock.releaseLock(); } }
function paymentOptionList_(settings, key, fallback) {
  try {
    const parsed = JSON.parse(settings[key] || '');
    if (Array.isArray(parsed) && parsed.length) {
      let values = fallback.concat(parsed).map(cleanText_).filter(Boolean).filter(function(value,index,list){return list.indexOf(value)===index;});
      if (key === 'PAYMENT_WALLETS') values = values.filter(function(value){ return !/\b(bank|finance)\b/i.test(value); });
      return values;
    }
  } catch (e) {}
  return (key === 'PAYMENT_WALLETS' ? fallback.filter(function(value){ return !/\b(bank|finance)\b/i.test(value); }) : fallback.slice());
}

function productCategoryList_(ss, settings) {
  let saved = [];
  try { saved = JSON.parse(settings.PRODUCT_CATEGORIES || '[]'); } catch (e) {}
  if (!Array.isArray(saved)) saved = [];
  const existing = getProducts_(ss, APP.SHEETS.STOCK).concat(getProducts_(ss, APP.SHEETS.INVOICE_STOCK))
    .map(function (product) { return cleanText_(product.category); });
  const seen = {}, result = [];
  saved.concat(existing).forEach(function (value) {
    value = cleanText_(value);
    const key = value.toUpperCase();
    if (value && !seen[key]) { seen[key] = true; result.push(value); }
  });
  return result.sort(function (a, b) { return a.localeCompare(b); });
}

function getCustomers_() {
  const sheet = getSpreadsheet_().getSheetByName(APP.SHEETS.CUSTOMERS);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1)
    .map(customerFromRow_)
    .filter(function (c) { return c.id && c.notes !== 'Deleted'; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

function customerFromRow_(row) {
  return {
    id: cleanText_(row[0]),
    name: cleanText_(row[1]),
    phone: cleanText_(row[2]),
    address: cleanText_(row[3]),
    email: cleanText_(row[4]),
    notes: cleanText_(row[5])
  };
}

/** Credit customers, balances and settlements used by the Reports dashboard. */
function getCreditDashboard() {
  const ss = getSpreadsheet_(), settings = getSettings_(ss);
  return { settings: { defaultCreditLimit: Number(settings.DEFAULT_CREDIT_LIMIT || APP.DEFAULTS.DEFAULT_CREDIT_LIMIT) }, customers: creditCustomers_(ss), currency: settings.CURRENCY || APP.DEFAULTS.CURRENCY };
}
function saveCreditCustomer(request) {
  return withLock_(function () {
    const ss = getSpreadsheet_(), settings = getSettings_(ss);
    const customer = getOrCreateCreditCustomer_(ss, settings, request && request.name, request && request.phone, request && request.creditLimit);
    return Object.assign({}, customer, { outstanding: getCustomerOutstanding_(ss, customer.key) });
  });
}
function recordCreditPayment(request) {
  return withLock_(function () {
    const ss = getSpreadsheet_(), key = cleanText_(request && request.customerKey), amount = positive_(request && request.amount, 'Payment amount');
    const customer = creditCustomers_(ss).find(function (c) { return c.key === key; });
    if (!customer) throw new Error('Credit customer was not found.');
    const outstanding = getCustomerOutstanding_(ss, key);
    if (amount > outstanding) throw new Error('Payment cannot be more than the outstanding balance.');
    const ledger = getOrCreateSheet_(ss, APP.SHEETS.CREDIT_LEDGER); ensureHeaders_(ledger, creditLedgerHeaders_());
    ledger.appendRow([new Date(), customer.key, customer.name, customer.phone, 'PAYMENT', cleanText_(request.reference), 0, amount, -amount, cleanText_(request.notes)]);
    return { outstanding: round2_(outstanding - amount) };
  });
}

/** Lists cheque invoices that have not yet been marked as money received. */
function getPendingCheques() {
  const ss=getSpreadsheet_(), invoices=ss.getSheetByName(APP.SHEETS.INVOICES), bills=ss.getSheetByName(APP.SHEETS.BILLS), received=ss.getSheetByName(APP.SHEETS.CHEQUE_RECEIPTS);
  const settled={};
  if(received && received.getLastRow()>1) received.getDataRange().getValues().slice(1).forEach(function(r){ settled[cleanText_(r[1])]=true; });
  let rows=[];
  if (bills && bills.getLastRow() > 1) rows = rows.concat(bills.getDataRange().getValues().slice(1).map(function(r){let data={};try{data=JSON.parse(r[3])||{};}catch(e){}return {source:'NEW BILL', invoiceNo:cleanText_(r[0]), date:r[1], customer:cleanText_(data.customerName)||cleanText_(r[2]), checkNo:cleanText_(data.checkNo), checkDate:cleanText_(data.checkDate), paymentMethod:cleanText_(data.paymentMethod).toUpperCase(), amount:Number(r[4]||0)};}));
  if (invoices && invoices.getLastRow() > 1) rows = rows.concat(invoices.getDataRange().getValues().slice(1).map(function(r){let data={};try{data=JSON.parse(r[4])||{};}catch(e){}return {source:'INVOICE', invoiceNo:cleanText_(r[0]), date:r[1], customer:cleanText_(r[2])||cleanText_(r[3]), checkNo:cleanText_(data.checkNo), checkDate:cleanText_(data.checkDate), paymentMethod:cleanText_(data.paymentMethod).toUpperCase(), amount:Number(r[5]||0)};}));
  return rows.filter(function(x){return x.invoiceNo&&x.paymentMethod==='CHECK'&&!settled[x.invoiceNo];}).sort(function(a,b){return new Date(a.checkDate||a.date)-new Date(b.checkDate||b.date);});
}

/** Marks a cleared cheque as received without changing the original invoice. */
function markChequeReceived(request) {
  return withLock_(function(){
    const invoiceNo=cleanText_(request&&request.invoiceNo), reference=cleanText_(request&&request.reference), notes=cleanText_(request&&request.notes);
    if(!invoiceNo) throw new Error('Select a cheque invoice.');
    const pending=getPendingCheques().find(function(x){return x.invoiceNo===invoiceNo;});
    if(!pending) throw new Error('This cheque is not pending or was already marked as received.');
    const sh=getOrCreateSheet_(getSpreadsheet_(),APP.SHEETS.CHEQUE_RECEIPTS);
    ensureHeaders_(sh,['Received At','Invoice No','Cheque No','Customer','Amount','Bank / Reference','Notes','Status']);
    sh.appendRow([new Date(),pending.invoiceNo,pending.checkNo,pending.customer,pending.amount,reference,notes,'RECEIVED']);
    return {invoiceNo:pending.invoiceNo,amount:pending.amount};
  });
}
function getReport(request) {
  const ss = getSpreadsheet_(), settings = getSettings_(ss), type = cleanText_(request && request.type).toUpperCase();
  const date = cleanText_(request && request.date), month = cleanText_(request && request.month);
  let start, end, title;
  if (type === 'MONTHLY') { if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Choose a month.'); const p = month.split('-'); start = new Date(Number(p[0]), Number(p[1]) - 1, 1); end = new Date(Number(p[0]), Number(p[1]), 1); title = month; }
  else { const d = date ? new Date(date + 'T00:00:00') : new Date(); if (isNaN(d)) throw new Error('Choose a valid date.'); start = new Date(d.getFullYear(), d.getMonth(), d.getDate()); end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); title = AppUtilities.formatDate(start, AppSession.getScriptTimeZone(), 'yyyy-MM-dd'); }
  const totals = { sales: 0, cost: 0, profit: 0, cash: 0, credit: 0, card: 0, check: 0, invoices: 0 };
  function add(dateValue, total, cost, method) { const d = new Date(dateValue); if (d < start || d >= end) return; const n = Number(total || 0), c = Number(cost || 0); totals.sales += n; totals.cost += c; totals.profit += n - c; totals.invoices++; const m = String(method || 'CASH').toUpperCase(); if (m === 'CREDIT') totals.credit += n; else if (m === 'CARD') totals.card += n; else if (m === 'CHECK') totals.check += n; else totals.cash += n; }
  const bills = ss.getSheetByName(APP.SHEETS.BILLS); if (bills && bills.getLastRow() > 1) bills.getDataRange().getValues().slice(1).forEach(function (r) { add(r[1], r[4], r[5], 'CASH'); });
  const invoices = ss.getSheetByName(APP.SHEETS.INVOICES); if (invoices && invoices.getLastRow() > 1) invoices.getDataRange().getValues().slice(1).forEach(function (r) { let x = {}; try { x = JSON.parse(r[4]) || {}; } catch (e) {} add(r[1], r[5], r[6], x.paymentMethod); });
  Object.keys(totals).forEach(function (k) { totals[k] = round2_(totals[k]); });
  return { title: title, type: type === 'MONTHLY' ? 'Monthly' : 'Daily', totals: totals, creditCustomers: creditCustomers_(ss), currency: settings.CURRENCY || APP.DEFAULTS.CURRENCY };
}
function creditCustomers_(ss) {
  const sheet = ss.getSheetByName(APP.SHEETS.CREDIT_CUSTOMERS); if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues().slice(1).filter(function (r) { return cleanText_(r[0]); }).map(function (r) { const c = { key: cleanText_(r[0]), name: cleanText_(r[1]), phone: cleanText_(r[2]), creditLimit: Number(r[3] || 0) }; c.outstanding = getCustomerOutstanding_(ss, c.key); c.oldestCreditDate = getOldestCreditDate_(ss, c.key, c.outstanding); c.daysOverdue = c.oldestCreditDate ? Math.floor((new Date() - c.oldestCreditDate) / 86400000) : 0; c.overdue = c.outstanding > 0 && c.daysOverdue > 30; return c; });
}
function getOrCreateCreditCustomer_(ss, settings, name, phone, limit) {
  name = cleanText_(name); phone = cleanText_(phone); if (!name && !phone) throw new Error('Enter a customer name or phone number for credit sales.');
  const key = phone ? 'PHONE:' + phone.replace(/\s+/g, '') : 'NAME:' + name.toUpperCase();
  const sheet = getOrCreateSheet_(ss, APP.SHEETS.CREDIT_CUSTOMERS); ensureHeaders_(sheet, creditCustomerHeaders_());
  const rows = sheet.getDataRange().getValues(), index = rows.slice(1).findIndex(function (r) { return cleanText_(r[0]) === key; });
  const creditLimit = limit === undefined || limit === '' ? Number(index >= 0 ? rows[index + 1][3] : (settings.DEFAULT_CREDIT_LIMIT || APP.DEFAULTS.DEFAULT_CREDIT_LIMIT)) : nonNegative_(limit, 'Credit limit');
  if (index >= 0) { sheet.getRange(index + 2, 2, 1, 3).setValues([[name || rows[index + 1][1], phone || rows[index + 1][2], creditLimit]]); }
  else sheet.appendRow([key, name || phone, phone, creditLimit, new Date()]);
  return { key: key, name: name || phone, phone: phone, creditLimit: creditLimit };
}
function getCustomerOutstanding_(ss, key) { const sh = ss.getSheetByName(APP.SHEETS.CREDIT_LEDGER); if (!sh || sh.getLastRow() < 2) return 0; return round2_(sh.getDataRange().getValues().slice(1).filter(function (r) { return cleanText_(r[1]) === key; }).reduce(function (sum, r) { return sum + Number(r[8] || 0); }, 0)); }
function getOldestCreditDate_(ss, key, outstanding) { if (outstanding <= 0) return null; const sh = ss.getSheetByName(APP.SHEETS.CREDIT_LEDGER); if (!sh || sh.getLastRow() < 2) return null; const dates = sh.getDataRange().getValues().slice(1).filter(function (r) { return cleanText_(r[1]) === key && String(r[4]).toUpperCase() === 'CREDIT SALE'; }).map(function (r) { return new Date(r[0]); }).filter(function (d) { return !isNaN(d); }).sort(function (a, b) { return a - b; }); return dates[0] || null; }
function nextProductId_(rows, prefix) {
  let number = Math.max(1, rows.length);
  let id;
  do { id = prefix + '-' + String(number++).padStart(5, '0'); }
  while (rows.slice(1).some(function (row) { return cleanText_(row[0]).toUpperCase() === id; }));
  return id;
}
function cleanText_(value) { return value === null || value === undefined ? '' : String(value).trim(); }
function positive_(value, label) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) throw new Error(label + ' must be greater than zero.'); return n; }
function nonNegative_(value, label) { const n = Number(value || 0); if (!Number.isFinite(n) || n < 0) throw new Error(label + ' cannot be negative.'); return n; }
function round2_(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

/**
 * Simple Invoice (.bak) migration.  The old backup is archived for audit, and
 * its products, sale bills, payments and credit balances are merged into the
 * live POS lists so Stock, Bill History, reprint/view and returns use one place.
 */
const LEGACY_BACKUP_ARCHIVE_SHEET_ = 'Legacy Backup Archive';
const LEGACY_BACKUP_IMPORTS_SHEET_ = 'Legacy Backup Imports';
const LEGACY_BACKUP_RESTORE_INDEX_SHEET_ = 'Legacy Backup Restore Index';
const LEGACY_BACKUP_FILES_ = Object.freeze({
  '2/Product.xml': 'Products', '2/Contractors.xml': 'Customers',
  '2/Category.xml': 'Categories',
  '2/Sale.xml': 'Sales / Invoices', '2/SaleItem.xml': 'Sale Items',
  '2/PaymentMethods.xml': 'Payment Methods',
  '2/Payments.xml': 'Payments', '2/Suppliers.xml': 'Supplier Links',
  '2/Purchase.xml': 'Purchases', '2/PurchaseItem.xml': 'Purchase Items',
  '2/Address.xml': 'Addresses', 'Company.xml': 'Company'
});

function inspectSimpleInvoiceBackup(request) {
  setShopContextFromRequest_(request);
  requireBackupUser_(request && request.actorPin);
  return legacyBackupParse_(request && request.dataUrl).summary;
}

function importSimpleInvoiceBackup(request) {
  setShopContextFromRequest_(request);
  requireBackupUser_(request && request.actorPin);
  const parsed = legacyBackupParse_(request && request.dataUrl);
  return withLock_(function () {
    const ss = getSpreadsheet_();
    const imports = getOrCreateSheet_(ss, LEGACY_BACKUP_IMPORTS_SHEET_);
    ensureHeaders_(imports, ['Imported At','Backup Fingerprint','Source','Records','Status']);
    const seen = imports.getLastRow() > 1 && imports.getDataRange().getValues().slice(1)
      .some(function (r) { return cleanText_(r[1]) === parsed.fingerprint && cleanText_(r[4]) === 'IMPORTED'; });
    if (seen) throw new Error('This backup was already imported. It is not restored twice, so bills and stock are not duplicated.');
    const archive = getOrCreateSheet_(ss, LEGACY_BACKUP_ARCHIVE_SHEET_);
    ensureHeaders_(archive, ['Imported At','Backup Fingerprint','Category','Legacy ID','Data (JSON)']);
    const now = new Date(), groups = {};
    parsed.records.forEach(function (r) { if (!groups[r.category]) groups[r.category] = []; groups[r.category].push({ id:r.id, data:r.data }); });
    Object.keys(groups).forEach(function (category) { archive.appendRow([now, parsed.fingerprint, category, '', JSON.stringify(groups[category])]); });
    imports.appendRow([now, parsed.fingerprint, 'Simple Invoice .bak', parsed.records.length, 'IMPORTED']);
    const live = mergeLegacyBackupIntoLivePos_(parsed);
    return Object.assign({}, parsed.summary, { imported: parsed.records.length, live: live });
  });
}

function mergeLegacyBackupIntoLivePos_(parsed) {
  const stock = restoreSimpleInvoiceStockTarget_(parsed, APP.SHEETS.STOCK);
  const sales = mergeLegacySalesIntoBills_(parsed);
  return { stock:stock, sales:sales };
}

function legacyRecordsByCategory_(parsed, category) {
  return (parsed.records || []).filter(function (record) { return record.category === category; });
}

function legacyMapByField_(records, fieldName) {
  const map = {};
  records.forEach(function (record) {
    const id = cleanText_(legacyProductField_(record.data || {}, [fieldName || 'ID']));
    if (id) map[id] = record.data || {};
  });
  return map;
}

function legacyDate_(value) {
  const text = cleanText_(value);
  const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(.+))?$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(text);
  return isNaN(d) ? new Date() : d;
}

function legacyCustomerKey_(name, phone) {
  phone = cleanText_(phone).replace(/\s+/g, '');
  name = cleanText_(name);
  return phone ? 'PHONE:' + phone : 'NAME:' + name.toUpperCase();
}

function mergeLegacySalesIntoBills_(parsed) {
  const ss = getSpreadsheet_();
  const bills = getOrCreateSheet_(ss, APP.SHEETS.BILLS); ensureHeaders_(bills, billHeaders_());
  const customers = getOrCreateSheet_(ss, APP.SHEETS.CUSTOMERS); ensureHeaders_(customers, customerHeaders_());
  const creditCustomers = getOrCreateSheet_(ss, APP.SHEETS.CREDIT_CUSTOMERS); ensureHeaders_(creditCustomers, creditCustomerHeaders_());
  const ledger = getOrCreateSheet_(ss, APP.SHEETS.CREDIT_LEDGER); ensureHeaders_(ledger, creditLedgerHeaders_());

  const existingBills = {};
  if (bills.getLastRow() > 1) bills.getDataRange().getValues().slice(1).forEach(function (row) { existingBills[cleanText_(row[0]).toUpperCase()] = true; });
  const existingCustomers = {};
  if (customers.getLastRow() > 1) customers.getDataRange().getValues().slice(1).forEach(function (row) { existingCustomers[cleanText_(row[0]).toUpperCase()] = true; });
  const existingCredit = {};
  if (creditCustomers.getLastRow() > 1) creditCustomers.getDataRange().getValues().slice(1).forEach(function (row) { existingCredit[cleanText_(row[0])] = true; });
  const existingCreditRefs = {};
  if (ledger.getLastRow() > 1) ledger.getDataRange().getValues().slice(1).forEach(function (row) { if (cleanText_(row[5])) existingCreditRefs[cleanText_(row[5]).toUpperCase()] = true; });

  const contractors = legacyMapByField_(legacyRecordsByCategory_(parsed, 'Customers'), 'ID');
  const paymentMethods = legacyMapByField_(legacyRecordsByCategory_(parsed, 'Payment Methods'), 'ID');
  const addressesByDoc = {};
  legacyRecordsByCategory_(parsed, 'Addresses').forEach(function (record) {
    const docId = legacyProductField_(record.data || {}, ['DocumentID']);
    if (docId && !addressesByDoc[docId]) addressesByDoc[docId] = record.data || {};
  });
  const itemsByDoc = {};
  legacyRecordsByCategory_(parsed, 'Sale Items').forEach(function (record) {
    const data = record.data || {}, docId = legacyProductField_(data, ['DocumentID']);
    if (!docId) return;
    if (!itemsByDoc[docId]) itemsByDoc[docId] = [];
    const qty = legacyProductNumber_(data, ['Quantity','Qty','QTY']) || 1;
    const total = legacyProductNumber_(data, ['GrossAmount','NetAmount','Amount']);
    const unit = qty ? round2_(total / qty) : total;
    itemsByDoc[docId].push({
      id: cleanText_(legacyProductField_(data, ['ProductID','ProductCode','ItemID','ID'])) || ('LEG-ITEM-' + cleanText_(record.id)),
      name: legacyProductField_(data, ['ProductName','Description','Name']) || 'Legacy item',
      qty: qty,
      cost: legacyProductNumber_(data, ['Cost']),
      unitPrice: unit,
      lineDiscount: legacyProductNumber_(data, ['Discount']),
      lineTotal: total,
      warranty: legacyProductField_(data, ['Warranty','WarrantyPeriod']),
      serial: legacyProductField_(data, ['Serial','SerialNumber','IMEI'])
    });
  });
  const paidByDoc = {};
  legacyRecordsByCategory_(parsed, 'Payments').forEach(function (record) {
    const data = record.data || {}, docId = legacyProductField_(data, ['DocumentID']);
    if (!docId) return;
    paidByDoc[docId] = round2_((paidByDoc[docId] || 0) + legacyProductNumber_(data, ['Amount']));
  });

  let addedBills = 0, skippedBills = 0, addedCredits = 0, addedCustomers = 0;
  legacyRecordsByCategory_(parsed, 'Sales / Invoices').forEach(function (record) {
    const data = record.data || {};
    const docId = legacyProductField_(data, ['ID']);
    const number = legacyProductField_(data, ['Number','DocumentNo','InvoiceNo']) || docId;
    const billNo = ('LEG-' + number).toUpperCase();
    if (!docId || existingBills[billNo]) { skippedBills++; return; }
    const contractor = contractors[legacyProductField_(data, ['ContractorID'])] || {};
    const address = addressesByDoc[docId] || {};
    const customerName = legacyProductField_(address, ['Name']) || legacyProductField_(contractor, ['FullName','Name']) || '';
    const customerPhone = legacyProductField_(contractor, ['Mobile','Phone','Country']) || '';
    const customerAddress = legacyProductField_(address, ['Data']) || [legacyProductField_(contractor, ['Street']), legacyProductField_(contractor, ['City'])].filter(Boolean).join(', ');
    const date = legacyDate_(legacyProductField_(data, ['IssueDate','Date','CreatedAt']));
    const total = legacyProductNumber_(data, ['TotalDue','Amount','Total']);
    const paid = paidByDoc[docId] || (legacyProductBoolean_(data, ['Paid']) ? total : 0);
    const creditBalance = Math.max(0, round2_(total - paid));
    const methodData = paymentMethods[legacyProductField_(data, ['PaymentMethodID'])] || {};
    const paymentMethod = creditBalance > 0 ? 'CREDIT' : (legacyProductField_(methodData, ['Name','PaymentMethod','Title']) || 'CASH');
    const items = itemsByDoc[docId] && itemsByDoc[docId].length ? itemsByDoc[docId] : [{ id:'LEGACY-'+docId, name:'Legacy bill', qty:1, cost:0, unitPrice:total, lineDiscount:0, lineTotal:total }];
    const costTotal = round2_(items.reduce(function (sum, item) { return sum + Number(item.cost || 0) * Number(item.qty || 0); }, 0));
    bills.appendRow([billNo, date, customerPhone, JSON.stringify({
      version:2, source:'Simple Invoice .bak', backupFingerprint:parsed.fingerprint, legacyDocumentId:docId,
      customerName:customerName, customerAddress:customerAddress, items:items, subtotal:total, billDiscount:0,
      total:total, paidAmount:paid, creditBalance:creditBalance, paymentMethod:paymentMethod,
      note:legacyProductField_(data, ['Message','AdditionalNotes','PurchaseOrder'])
    }), total, costTotal, round2_(total - costTotal), 'SALE', '']);
    existingBills[billNo] = true; addedBills++;

    const customerId = customerPhone ? ('CUS-' + customerPhone.replace(/\D+/g, '').slice(-9)) : ('CUS-LEG-' + docId);
    if (!existingCustomers[customerId.toUpperCase()] && (customerName || customerPhone)) {
      customers.appendRow([customerId, customerName, customerPhone, customerAddress, legacyProductField_(contractor, ['Email']), 'Imported from Simple Invoice .bak', new Date()]);
      existingCustomers[customerId.toUpperCase()] = true; addedCustomers++;
    }
    if (creditBalance > 0 && !existingCreditRefs[billNo]) {
      const key = legacyCustomerKey_(customerName || customerPhone || billNo, customerPhone);
      if (!existingCredit[key]) {
        creditCustomers.appendRow([key, customerName || customerPhone || billNo, customerPhone, 0, new Date()]);
        existingCredit[key] = true;
      }
      ledger.appendRow([date, key, customerName || customerPhone || billNo, customerPhone, 'CREDIT SALE', billNo, creditBalance, 0, creditBalance, 'Imported from Simple Invoice .bak']);
      existingCreditRefs[billNo] = true; addedCredits++;
    }
  });
  return { addedBills:addedBills, skippedBills:skippedBills, addedCustomers:addedCustomers, addedCredits:addedCredits };
}

/** Restores products and their available quantities from a Simple Invoice backup into live POS Stock.
 * This is intentionally separate from archival import, and can be used even when the backup was
 * already archived. Existing matching item codes are updated instead of duplicated. */
function restoreSimpleInvoiceStock(request) {
  setShopContextFromRequest_(request);
  requireBackupUser_(request && request.actorPin);
  const parsed = legacyBackupParse_(request && request.dataUrl);
  const requestedTarget = cleanText_(request && request.target);
  return withLock_(function () {
    if (requestedTarget === 'BOTH') {
      const shared = restoreSimpleInvoiceStockTarget_(parsed, APP.SHEETS.STOCK);
      const history = mergeLegacySalesIntoBills_(parsed);
      return Object.assign(shared, { target:'Shared Stock', history:history });
    }
    const stockResult = restoreSimpleInvoiceStockTarget_(parsed, requestedTarget === APP.SHEETS.INVOICE_STOCK ? APP.SHEETS.INVOICE_STOCK : APP.SHEETS.STOCK);
    const history = mergeLegacySalesIntoBills_(parsed);
    return Object.assign(stockResult, { history:history });
  });
}

function restoreSimpleInvoiceStockTarget_(parsed, target) {
    target = sharedStockSheet_(target);
    const ss = getSpreadsheet_(), stock = getOrCreateSheet_(ss, target);
    ensureHeaders_(stock, ['Item ID','Item Name','Cost Price','Selling Price','Stock Qty','Track Stock','Status','Category','Warranty Period','Serial Number','Barcode']);
    const rows = stock.getDataRange().getValues();
    const existing = {}, existingValues = {};
    rows.slice(1).forEach(function (row, index) { const id = cleanText_(row[0]).toUpperCase(); if (id) { existing[id] = index + 2; existingValues[id] = row.slice(); } });
    const meta = supabaseReadDocument_(supabaseSheetPath_(target)) || { headers:[], nextRow:2 };
    let nextRow = Math.max(2, Number(meta.nextRow || rows.length + 1));
    const writes = [];
    const products = parsed.records.filter(function (record) { return record.category === 'Products'; });
    if (!products.length) throw new Error('No products were found in this backup.');
    const categoryNames = {};
    parsed.records.filter(function (record) { return record.category === 'Categories'; }).forEach(function (record) {
      const id = legacyProductField_(record.data, ['ID','CategoryID']);
      const name = legacyProductField_(record.data, ['ShortName','Name','CategoryName']);
      if (id && name) categoryNames[id] = name;
    });
    let added = 0, updated = 0, skipped = 0, restoredIds = [];
    products.forEach(function (record, index) {
      const data = record.data || {};
      const name = legacyProductField_(data, ['ProductName','ItemName','Name','Description','Title']);
      if (!name) { skipped++; return; }
      let id = legacyProductField_(data, ['ProductID','ItemID','ProductCode','ItemCode','Code','Barcode','BarCode','ID']);
      if (!id) id = 'LEG-' + String(index + 1).padStart(5, '0');
      const cost = legacyProductNumber_(data, ['CostPrice','PurchasePrice','BuyingPrice','BuyPrice','PurchaseCost','Cost','Price2']);
      const price = legacyProductNumber_(data, ['SellingPrice','SalePrice','RetailPrice','UnitPrice','Price','Price1']);
      const qty = legacyProductNumber_(data, ['StockQty','StockQuantity','AvailableQuantity','AvailableQty','CurrentStock','Quantity','Qty','QTY','Stock']);
      const categoryId = legacyProductField_(data, ['CategoryID']);
      const category = legacyProductField_(data, ['Category','CategoryName','Group','GroupName']) || categoryNames[categoryId] || '';
      const barcode = legacyProductField_(data, ['Barcode','BarCode','EAN','UPC','Index']);
      const trackStock = legacyProductBoolean_(data, ['StockControl','TrackStock']) ? 'YES' : 'NO';
      const key = id.toUpperCase(), rowNumber = existing[key];
      if (rowNumber) {
        const values = existingValues[key];
        values[1] = name; values[2] = cost; values[3] = price; values[4] = qty; values[5] = trackStock; values[6] = 'YES'; values[7] = category;
        if (barcode) values[10] = barcode;
        writes.push({ path:supabaseRowPath_(target, rowNumber), object:{ row:rowNumber, values:values.map(supabaseSafeValue_) } });
        updated++;
      } else {
        const newRow = nextRow++;
        writes.push({ path:supabaseRowPath_(target, newRow), object:{ row:newRow, values:[id, name, cost, price, qty, trackStock, 'YES', category, '', '', barcode].map(supabaseSafeValue_) } });
        existing[key] = newRow;
        added++;
      }
      restoredIds.push(id);
    });
    if (!added && !updated) throw new Error('No usable product names were found in this backup.');
    meta.nextRow = nextRow;
    writes.push({ path:supabaseSheetPath_(target), object:meta });
    fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(writes);
    const restoreIndex = getOrCreateSheet_(ss, LEGACY_BACKUP_RESTORE_INDEX_SHEET_);
    ensureHeaders_(restoreIndex, ['Restored At','Backup Fingerprint','Stock List','Item ID','Status']);
    restoredIds.forEach(function (id) { restoreIndex.appendRow([new Date(), parsed.fingerprint, target, id, 'ACTIVE']); });
    return { added:added, updated:updated, skipped:skipped, total:added + updated, target:target };
}

/** Removes active items matching a selected legacy backup so that it can be restored afresh. */
function removeSimpleInvoiceBackupProducts(request) {
  setShopContextFromRequest_(request);
  requireBackupUser_(request && request.actorPin);
  const parsed = legacyBackupParse_(request && request.dataUrl), requested = cleanText_(request && request.target);
  return withLock_(function () {
    const targets = [sharedStockSheet_(requested === 'BOTH' ? APP.SHEETS.STOCK : requested)].filter(function (value, index, list) { return list.indexOf(value) === index; });
    const restoreIndex = getSpreadsheet_().getSheetByName(LEGACY_BACKUP_RESTORE_INDEX_SHEET_);
    if (!restoreIndex || restoreIndex.getLastRow() < 2) throw new Error('For safety, restore this backup once with this version before deleting its restored products.');
    const indexRows = restoreIndex.getDataRange().getValues(), ids = {}, indexWrites = [];
    indexRows.slice(1).forEach(function (row, index) {
      if (cleanText_(row[1]) !== parsed.fingerprint || targets.indexOf(cleanText_(row[2])) < 0 || cleanText_(row[4]) !== 'ACTIVE') return;
      ids[cleanText_(row[3]).toUpperCase()] = true;
      const values = row.slice(); values[4] = 'REMOVED'; const rowNumber = index + 2;
      indexWrites.push({ path:supabaseRowPath_(LEGACY_BACKUP_RESTORE_INDEX_SHEET_, rowNumber), object:{ row:rowNumber, values:values.map(supabaseSafeValue_) } });
    });
    if (!Object.keys(ids).length) throw new Error('No active products restored from this backup were found.');
    let removed = 0;
    targets.forEach(function (target) {
      const sheet = getSpreadsheet_().getSheetByName(target); if (!sheet) return;
      const rows = sheet.getDataRange().getValues(), writes = [];
      rows.slice(1).forEach(function (row, index) {
        if (!ids[cleanText_(row[0]).toUpperCase()] || String(row[6]).toUpperCase() === 'NO') return;
        const values = row.slice(); values[6] = 'NO'; const rowNumber = index + 2;
        writes.push({ path:supabaseRowPath_(target, rowNumber), object:{ row:rowNumber, values:values.map(supabaseSafeValue_) } }); removed++;
      });
      if (writes.length) fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(writes);
    });
    if (indexWrites.length) fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(indexWrites);
    const imports = getSpreadsheet_().getSheetByName(LEGACY_BACKUP_IMPORTS_SHEET_);
    if (imports && imports.getLastRow() > 1) {
      const rows = imports.getDataRange().getValues(), writes = [];
      rows.slice(1).forEach(function (row, index) {
        if (cleanText_(row[1]) !== parsed.fingerprint) return;
        const values = row.slice(); values[4] = 'REMOVED'; const rowNumber = index + 2;
        writes.push({ path:supabaseRowPath_(LEGACY_BACKUP_IMPORTS_SHEET_, rowNumber), object:{ row:rowNumber, values:values.map(supabaseSafeValue_) } });
      });
      if (writes.length) fir9yMnTm4NSzvG9rrwjM2ec8xZgh1cafXH8_(writes);
    }
    return { removed:removed, target:targets.join(' and ') };
  });
}

function legacyProductField_(data, names) {
  const lookup = {};
  Object.keys(data || {}).forEach(function (key) { lookup[String(key).replace(/[^a-z0-9]/gi, '').toUpperCase()] = data[key]; });
  for (let i = 0; i < names.length; i++) {
    const value = lookup[String(names[i]).replace(/[^a-z0-9]/gi, '').toUpperCase()];
    if (cleanText_(value)) return cleanText_(value);
  }
  return '';
}
function legacyProductNumber_(data, names) {
  const text = legacyProductField_(data, names).replace(/[^0-9.\-]/g, '');
  const value = Number(text);
  return isFinite(value) && value >= 0 ? value : 0;
}
function legacyProductBoolean_(data, names) {
  const value = legacyProductField_(data, names).toUpperCase();
  return ['TRUE','YES','1','Y'].includes(value);
}

function listLegacyBackupImports(actorPin) {
  requireBackupUser_(actorPin);
  const sh = getSpreadsheet_().getSheetByName(LEGACY_BACKUP_IMPORTS_SHEET_);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getDataRange().getValues().slice(1).map(function (r) { return { date:r[0], fingerprint:cleanText_(r[1]), source:cleanText_(r[2]), records:Number(r[3] || 0), status:cleanText_(r[4]) }; });
}

function legacyBackupParse_(dataUrl) {
  const match = String(dataUrl || '').match(/^data:[^;]+;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) throw new Error('Choose a Simple Invoice .bak backup file.');
  const bytes = AppUtilities.base64Decode(match[1].replace(/\s/g, ''));
  if (bytes.length > 15 * 1024 * 1024) throw new Error('Backup is too large. Please use a file under 15 MB.');
  let files;
  try { files = AppUtilities.unzip(AppUtilities.newBlob(bytes, 'application/zip', 'sinvoice.bak')); }
  catch (e) { throw new Error('This is not a readable Simple Invoice .bak backup.'); }
  const byName = {}; files.forEach(function (blob) { byName[String(blob.getName()).replace(/\\/g,'/')] = blob.getDataAsString('UTF-8'); });
  const byBase = {}; Object.keys(byName).forEach(function (name) { byBase[name.split('/').pop().toLowerCase()] = byName[name]; });
  const backupXml = function (path) { return byName[path] || byBase[path.split('/').pop().toLowerCase()] || ''; };
  if (!backupXml('2/Product.xml') && !backupXml('2/Sale.xml')) throw new Error('This backup does not contain Simple Invoice data.');
  const records = [];
  Object.keys(LEGACY_BACKUP_FILES_).forEach(function (file) {
    const xml = backupXml(file); if (!xml) return;
    legacyBackupXmlRows_(xml).forEach(function (data, i) {
      records.push({ category:LEGACY_BACKUP_FILES_[file], id:cleanText_(data.ID || data.DocumentID || data.ProductID || data.Number || (i + 1)), data:data });
    });
  });
  const counts = {}; records.forEach(function (r) { counts[r.category] = (counts[r.category] || 0) + 1; });
  const digest = AppUtilities.computeDigest(AppUtilities.DigestAlgorithm.SHA_256, bytes);
  const fingerprint = AppUtilities.base64Encode(digest).replace(/[+/=]/g, '').slice(0, 24);
  return { fingerprint:fingerprint, records:records, summary:{ source:'Simple Invoice .bak', fingerprint:fingerprint, totalRecords:records.length, counts:counts } };
}

function legacyBackupXmlRows_(xmlText) {
  try {
    const root = XmlService.parse(xmlText).getRootElement();
    return root.getChildren().map(function (node) {
      const row = {}; node.getChildren().forEach(function (field) { row[field.getName()] = field.getValue(); }); return row;
    });
  } catch (e) { return []; }
}

function loanHeaders_(){return ['Loan No','Agreement No','Date','Customer Name','Customer Phone','Principal','Interest Type','Interest Rate','Frequency','Installments','Interest Amount','Total Payable','Installment Amount','Paid','Balance','Due Date','Terms','Status','Created By','Interest Period'];}
function loanPaymentHeaders_(){return ['Payment No','Loan No','Date','Amount','Note','Balance After','Received By'];}
function loanPlans_(ss){const raw=getSettings_(ss).LOAN_PLANS||'[]';try{return JSON.parse(raw)||[];}catch(e){return[];}}
function loanActor_(request){setShopContextFromRequest_(request);const actor=requirePermission_(request&&request.actorPin,'loans');return actor;}
function getLoanModuleData(request){loanActor_(request);const ss=getSpreadsheet_(),settings=getSettings_(ss),plans=loanPlans_(ss),sh=ss.getSheetByName(APP.SHEETS.LOANS),rows=sh&&sh.getLastRow()>1?sh.getDataRange().getValues().slice(1):[],payments=ss.getSheetByName(APP.SHEETS.LOAN_PAYMENTS),paymentRows=payments&&payments.getLastRow()>1?payments.getDataRange().getValues().slice(1):[];return{plans:plans,terms:settings.LOAN_TERMS||'',receiptNote:settings.LOAN_RECEIPT_NOTE||'',agreementEnabled:String(settings.LOAN_AGREEMENT_ENABLED||'YES').toUpperCase()!=='NO',loans:rows.reverse().map(function(r){return{loanNo:r[0],agreementNo:r[1],date:r[2],customerName:r[3],customerPhone:r[4],principal:Number(r[5]||0),interestType:r[6],interestRate:Number(r[7]||0),frequency:r[8],installments:Number(r[9]||0),interestAmount:Number(r[10]||0),totalPayable:Number(r[11]||0),installmentAmount:Number(r[12]||0),paid:Number(r[13]||0),balance:Number(r[14]||0),dueDate:r[15],terms:r[16],status:r[17]||'ACTIVE',interestPeriod:r[19]||r[8]||'MONTHLY'};}),payments:paymentRows.reverse()};}
function saveLoanSettings(request){loanActor_(request);if(!request||!request.settings)throw new Error('Loan settings are required.');const ss=getSpreadsheet_(),s=request.settings,plans=Array.isArray(s.plans)?s.plans.map(function(p){return{name:cleanText_(p.name),frequency:cleanText_(p.frequency),interestType:cleanText_(p.interestType),rate:Number(p.rate||0),installments:Number(p.installments||1),terms:cleanText_(p.terms)};}).filter(function(p){return p.name;}):[];setSetting_(ss,'LOAN_PLANS',JSON.stringify(plans));setSetting_(ss,'LOAN_TERMS',cleanText_(s.terms));setSetting_(ss,'LOAN_RECEIPT_NOTE',cleanText_(s.receiptNote));setSetting_(ss,'LOAN_AGREEMENT_ENABLED',s.agreementEnabled===false?'NO':'YES');return{plans:plans,terms:cleanText_(s.terms),receiptNote:cleanText_(s.receiptNote),agreementEnabled:s.agreementEnabled!==false};}
function saveLoan(request){const actor=loanActor_(request),r=request||{};const principal=nonNegative_(r.principal,'Principal amount'),rate=nonNegative_(r.interestRate,'Interest rate'),installments=Math.max(1,Math.floor(Number(r.installments||1))),interestType=cleanText_(r.interestType)||'PERCENT',frequency=cleanText_(r.frequency)||'MONTHLY',interestPeriod=cleanText_(r.interestPeriod)||frequency;if(!cleanText_(r.customerName)&&!cleanText_(r.customerPhone))throw new Error('Enter customer name or phone.');const periods=interestPeriod===frequency?installments:1;let interest=interestType==='FIXED'?round2_(rate*periods):round2_(principal*rate/100*periods);const total=round2_(principal+interest),installment=round2_(total/installments),now=new Date(),ss=getSpreadsheet_(),s=getSettings_(ss),n=Math.max(1,Number(s.NEXT_LOAN_NUMBER||1)),prefix=s.INVOICE_PREFIX||'SHOP',loanNo=prefix+String(n).padStart(4,'0')+'LN',agreementNo=prefix+String(n).padStart(4,'0')+'AG',dueDate=r.dueDate?new Date(r.dueDate):new Date(now.getTime()+30*86400000),terms=cleanText_(r.terms)||s.LOAN_TERMS||'',sh=getOrCreateSheet_(ss,APP.SHEETS.LOANS);ensureHeaders_(sh,loanHeaders_());sh.appendRow([loanNo,agreementNo,now,cleanText_(r.customerName),cleanText_(r.customerPhone),principal,interestType,rate,frequency,installments,interest,total,installment,0,total,dueDate,terms,'ACTIVE',actor.name,interestPeriod]);setSetting_(ss,'NEXT_LOAN_NUMBER',n+1);return{loanNo:loanNo,agreementNo:agreementNo,date:now,customerName:cleanText_(r.customerName),customerPhone:cleanText_(r.customerPhone),principal:principal,interestType:interestType,interestRate:rate,interestPeriod:interestPeriod,frequency:frequency,installments:installments,interestAmount:interest,totalPayable:total,installmentAmount:installment,paid:0,balance:total,dueDate:dueDate,terms:terms,receiptNote:s.LOAN_RECEIPT_NOTE||''};}
function saveLoanPayment(request){const actor=loanActor_(request),loanNo=cleanText_(request&&request.loanNo),amount=nonNegative_(request&&request.amount,'Payment amount'),ss=getSpreadsheet_(),sh=ss.getSheetByName(APP.SHEETS.LOANS);if(!sh||sh.getLastRow()<2)throw new Error('Loan not found.');const rows=sh.getDataRange().getValues(),index=rows.slice(1).findIndex(function(r){return cleanText_(r[0])===loanNo;});if(index<0)throw new Error('Loan not found.');const row=rows[index+1],balance=Number(row[14]||0);if(amount<=0||amount>balance)throw new Error('Payment must be greater than zero and not exceed the balance.');const next=round2_(balance-amount),pno=loanNo+'-P'+String(index+1).padStart(3,'0');row[13]=round2_(Number(row[13]||0)+amount);row[14]=next;if(next<=0)row[17]='PAID';sh.getRange(index+2,1,row.length).setValues([row]);const ps=getOrCreateSheet_(ss,APP.SHEETS.LOAN_PAYMENTS);ensureHeaders_(ps,loanPaymentHeaders_());ps.appendRow([pno,loanNo,new Date(),amount,cleanText_(request&&request.note),next,actor.name]);return{paymentNo:pno,loanNo:loanNo,amount:amount,balance:next};}
function paymentWalletDefaults_() {
  return ['eZ Cash', 'mCash', 'Dialog Pay', 'FriMi', 'Koko', 'Koko Payment', 'Wallet Payment', 'PayHere', 'LankaPay', 'LankaQR', 'HelaPay', 'QR Payment', 'QR Pay'];
}

function paymentBillerDefaults_() {
  return ['GovPay', 'Airtel', 'Dialog HBB/CDMA', 'Dialog Mobile', 'Dialog Tech Support', 'Dialog Television TL', 'Dialog TV', 'Dialog WiMax', 'Hutch', 'Lanka Broadband', 'Package Topup', 'Ceylon Electricity Board', 'Lanka Electricity Company', 'National Water Supply', 'AIA Insurance Loan', 'AIA Life Premium', 'Allianz General', 'Allianz Life', 'Arpico Insurance', 'Ceylinco Life', 'HNB Life', 'Janashakthi Life', 'LOLC Life Assurance', 'Sanasa Life Insurance', 'Sri Lanka Insurance', 'Union Assurance', 'Fintrx Finance', 'HNB Finance', 'Assetline Leasing', 'Genie Quick Loan', 'Lendtech Lanka', 'PickMe', 'Uber Eats', 'Uber Taxi', 'Asiri Hospitals', 'Doc 990', 'National Cancer Hospital', 'BT Stationary', 'Back to the Bible', 'Help Age', 'Hot Wheels Delivery Service', 'IdeaMart', 'Kandy Municipal Council'];
}

function paymentServiceChargeKey_(wallet,biller){return cleanText_(wallet)+'||'+cleanText_(biller);}
function uniqueList_(list){const seen={};return (list||[]).map(cleanText_).filter(function(v){const k=v.toLowerCase();if(!v||seen[k])return false;seen[k]=true;return true;});}
function paymentServiceCharges_(settings){
  let out={};
  try{const parsed=JSON.parse(cleanText_(settings&&settings.PAYMENT_SERVICE_CHARGES)||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))out=parsed;}catch(e){out={};}
  return out;
}
function managePaymentServiceCharge(request){
  const actor=accountForPin_(request&&request.actorPin),wallet=cleanText_(request&&request.wallet),biller=cleanText_(request&&request.biller),action=cleanText_(request&&request.action).toUpperCase();
  if(!actor||!['OWNER','SUPER_ADMIN'].includes(actor.role))throw new Error('Only the Software Owner or Super Admin can change service charges.');
  if(!wallet||!biller)throw new Error('Select a wallet and service.');
  if(!['SET','DELETE'].includes(action))throw new Error('Invalid service charge action.');
  const ss=getSpreadsheet_(),settings=getSettings_(ss),charges=paymentServiceCharges_(settings),key=paymentServiceChargeKey_(wallet,biller);
  if(action==='DELETE')delete charges[key];else{const amount=Number(request&&request.amount);if(!isFinite(amount)||amount<0)throw new Error('Enter a valid service charge.');charges[key]=round2_(amount);}
  setSetting_(ss,'PAYMENT_SERVICE_CHARGES',JSON.stringify(charges));return{wallet:wallet,biller:biller,amount:charges[key]||0,deleted:action==='DELETE'};
}
function paymentBillerMap_(settings) {
  let saved = {};
  try { saved = JSON.parse(cleanText_(settings.PAYMENT_BILLERS_BY_WALLET) || '{}'); } catch (e) { saved = {}; }
  // Non-bank/non-finance billers available from the supported Sri Lankan
  // wallet payment channels.  These are intentionally kept separate from
  // the Bank & Finance ledgers.
  const utilities=['Ceylon Electricity Board','Lanka Electricity Company','National Water Supply','SLT - Sri Lanka Telecom','Dialog','Mobitel','Hutch','Airtel','Dialog HBB/CDMA','Dialog Mobile','Dialog Tech Support','Dialog Television TL','Dialog TV','Dialog WiMax','Lanka Broadband','Package Topup'];
  const publicAndMerchantServices=['GovPay','Department of Motor Traffic','Sri Lanka Police','Immigration and Emigration','Inland Revenue Department','Municipal Council Payment','Pradeshiya Sabha Payment','PickMe','Uber Eats','Uber Taxi','Asiri Hospitals','Doc 990','National Cancer Hospital','BT Stationary','Help Age','IdeaMart','Kandy Municipal Council'];
  const insurance=['AIA Life Premium','Allianz General','Allianz Life','Ceylinco Life','HNB Life','Janashakthi Life','LOLC Life Assurance','Sanasa Life Insurance','Sri Lanka Insurance','Union Assurance'];
  const finance=['HNB Finance','Assetline Leasing','Genie Quick Loan','Lendtech Lanka','Fintrex Finance','Fintrx Finance','Fintrex Finance – Phone Installment Payment','LOLC Finance','LB Finance','Vallibel Finance','Singer Finance','Commercial Leasing & Finance','Central Finance','Phone Installment Payment','Mobile Phone Installment Payment','Lesi Pay'];
  const ezCashDialogPayServices=utilities.concat(publicAndMerchantServices,finance,insurance);
  const defaults = {
    'eZ Cash': ezCashDialogPayServices,
    'mCash': ['mCash Cash In','mCash Cash Out','mCash Bill Payment','Mobitel Reload','Mobitel Postpaid','SLT Mobitel','Mobitel Broadband'].concat(utilities,publicAndMerchantServices,finance,insurance),
    'FriMi': ['FriMi Transfer','FriMi Bill Payment','FriMi Merchant Payment'].concat(utilities,publicAndMerchantServices,insurance),
    'Koko': ['Koko Payment','Koko Pay Later Merchant Payment','Koko Merchant Payment'],
    'Koko Payment': ['Koko Payment','Koko Pay Later Merchant Payment','Koko Merchant Payment'],
    'Wallet Payment': ['Wallet Payment','eZ Cash','mCash','Dialog Pay','FriMi','Koko','LankaQR','QR Payment'],
    'Bank Payment': ['Bank Payment','Bank Account Payment','Online Bank Transfer'],
    'Bank Transfer': ['Bank Transfer','Bank Account Payment','Online Bank Transfer'],
    'Online Payment': ['Online Payment','Payment Link','Online Card Payment'],
    'PayHere': ['PayHere Merchant Payment','PayHere Online Payment','PayHere Invoice Payment'].concat(publicAndMerchantServices),
    'LankaPay': ['LankaPay Bill Payment','LankaPay Merchant Payment','CEB Bill Payment','LECO Bill Payment','Water Board Bill Payment','SLT Telecom Bill Payment'].concat(utilities,publicAndMerchantServices),
    'HelaPay': ['HelaPay Government Payment','HelaPay Merchant Payment','HelaPay Bill Payment'].concat(utilities,publicAndMerchantServices),
    'LankaQR': ['LankaQR Merchant Payment','LankaQR Bill Payment'],
    'QR Pay': ['QR Pay Merchant Payment','QR Pay Bill Payment'],
    'QR Payment': ['QR Merchant Payment','QR Bill Payment'],
    'GovPay': ['GovPay','Department of Motor Traffic','Sri Lanka Police','Immigration and Emigration','Inland Revenue Department','Municipal Council Payment','Pradeshiya Sabha Payment']
  };
  // Keep the Wallet -> Service/Biller relationship strict. Older versions
  // could save one combined list under every wallet, which made eZ Cash,
  // mCash, Koko, etc. display each other's services in Bill Payment.
  // Preserve intentional custom names and renamed entries, but only allow
  // built-in names that belong to the selected wallet.
  const builtInServices = uniqueList_(Object.keys(defaults).reduce(function (all, key) {
    return all.concat(defaults[key] || []);
  }, []));
  paymentOptionList_(settings, 'PAYMENT_WALLETS', paymentWalletDefaults_()).forEach(function (wallet) {
    const allowed = defaults[wallet] || [];
    if (!Array.isArray(saved[wallet])) {
      saved[wallet] = allowed.slice();
      return;
    }
    const persisted = uniqueList_(saved[wallet].map(cleanText_).filter(Boolean));
    saved[wallet] = uniqueList_(persisted.filter(function (service) {
      return allowed.indexOf(service) >= 0 || builtInServices.indexOf(service) < 0;
    }));
    // Repair an empty legacy mapping instead of leaving both Payment Setup
    // and Bill Payment with a blank Service/Biller dropdown.
    if (!saved[wallet].length && allowed.length) saved[wallet] = allowed.slice();
  });
  return saved;
}

function serialStockHeaders_(){return ['Serial ID','Added At','Purchase No','Item ID','Item Name','Serial Number','Warranty','Status','Sold Ref','Sold At','IMEI Number'];}
function identifierListFromText_(value){return cleanText_(value).split(/[\n,;]+/).map(cleanText_).filter(Boolean);}
function identifierBatchFromRange_(start,end){
  start=cleanText_(start);end=cleanText_(end);if(!start||!end)return[];
  const a=String(start).match(/^(.*?)(\d+)$/),b=String(end).match(/^(.*?)(\d+)$/);
  if(!a||!b||a[1]!==b[1])throw new Error('Start and end must use the same prefix and a numeric ending.');
  const from=Number(a[2]),to=Number(b[2]),width=a[2].length;
  if(!isFinite(from)||!isFinite(to)||to<from)throw new Error('End number must be greater than or equal to start number.');
  if(to-from>500)throw new Error('Range is too large. Add 500 numbers or fewer at once.');
  const out=[];for(let n=from;n<=to;n++)out.push(a[1]+String(n).padStart(width,'0'));return out;
}
function serialBatchFromRequest_(request, qty){
  request=request||{};
  let serials=Array.isArray(request.serials)?request.serials.map(cleanText_).filter(Boolean):identifierListFromText_(request.serials||request.serialList);
  let imeis=Array.isArray(request.imeis)?request.imeis.map(cleanText_).filter(Boolean):identifierListFromText_(request.imeis||request.imeiList);
  serials=serials.concat(identifierBatchFromRange_(request.serialStart,request.serialEnd));
  imeis=imeis.concat(identifierBatchFromRange_(request.imeiStart,request.imeiEnd));
  serials=serials.filter(function(value,index,self){return self.indexOf(value)===index;});
  imeis=imeis.filter(function(value,index,self){return self.indexOf(value)===index;});
  if(serials.length&&serials.length!==qty)throw new Error('Serial count must match stock quantity. Quantity: '+qty+', serials: '+serials.length+'.');
  if(imeis.length&&imeis.length!==qty)throw new Error('IMEI count must match stock quantity. Quantity: '+qty+', IMEI: '+imeis.length+'.');
  const count=Math.max(serials.length,imeis.length),out=[];
  for(let i=0;i<count;i++)out.push({serial:serials[i]||'',imei:imeis[i]||''});
  return out;
}
function appendSerialStock_(ss,batch){
  const sh=getOrCreateSheet_(ss,APP.SHEETS.SERIAL_STOCK);ensureHeaders_(sh,serialStockHeaders_());
  const existing={};if(sh.getLastRow()>1)sh.getDataRange().getValues().slice(1).forEach(function(r){const s=cleanText_(r[5]).toUpperCase(),i=cleanText_(r[10]).toUpperCase();if(s)existing['S:'+s]=true;if(i)existing['I:'+i]=true;});
  batch.serials.forEach(function(entry){
    const serial=typeof entry==='object'?cleanText_(entry.serial):cleanText_(entry),imei=typeof entry==='object'?cleanText_(entry.imei):'';
    if(!serial&&!imei)return;
    const sk=serial.toUpperCase(),ik=imei.toUpperCase();
    if(sk&&existing['S:'+sk])throw new Error('Serial number already exists in stock: '+serial);
    if(ik&&existing['I:'+ik])throw new Error('IMEI number already exists in stock: '+imei);
    if(sk)existing['S:'+sk]=true;if(ik)existing['I:'+ik]=true;
    sh.appendRow(['SER-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),new Date(),batch.purchaseNo,batch.itemId,batch.itemName,serial,batch.warranty,'AVAILABLE','','',imei]);
  });
}

/** Final payment setup separation: Wallets, Service/Billers, Wallet mappings, and Payment Methods are independent. */
function paymentMethodDefaults_() {
  return ['Cash', 'Credit', 'Check', 'Card', 'Bank Transfer', 'Bank Payment', 'Wallet Payment', 'Koko Pay', 'QR Pay', 'Dialog Pay', 'Online Payment'];
}

function paymentWalletDefaults_() {
  return ['eZ Cash', 'mCash', 'Dialog Pay', 'FriMi', 'GovPay'];
}

function paymentBillerDefaults_() {
  return ['CEB - Ceylon Electricity Board', 'LECO - Lanka Electricity Company', 'Water Board - National Water Supply & Drainage Board', 'SLT - Sri Lanka Telecom', 'Dialog Television', 'Dialog Broadband', 'Mobitel Postpaid', 'PickMe', 'Lesi Pay', 'Fintrex Finance', 'Fintrx Finance', 'Mobile Phone Installment Payment', 'Phone Installment Payment', 'Department of Motor Traffic', 'Sri Lanka Police', 'Immigration and Emigration', 'Inland Revenue Department', 'Municipal Council Payment', 'Pradeshiya Sabha Payment', 'Other'];
}

function paymentSetupDefaults_(type) {
  type = cleanText_(type).toUpperCase();
  if (type === 'WALLET') return paymentWalletDefaults_();
  if (type === 'METHOD') return paymentMethodDefaults_();
  if (type === 'BANK') return ['Cash Bank', 'Bank Account'];
  if (type === 'BANK_SERVICE') return sriLankaBankList_();
  if (type === 'FINANCE') return sriLankaFinanceList_();
  return paymentBillerDefaults_();
}

function paymentBillerMap_(settings) {
  let saved = {};
  try { saved = JSON.parse(cleanText_(settings && settings.PAYMENT_BILLERS_BY_WALLET) || '{}'); } catch (e) { saved = {}; }
  const defaults = {
    'eZ Cash': ['CEB - Ceylon Electricity Board', 'LECO - Lanka Electricity Company', 'Water Board - National Water Supply & Drainage Board', 'SLT - Sri Lanka Telecom', 'Dialog Television', 'Dialog Broadband', 'PickMe', 'Lesi Pay', 'Fintrex Finance', 'Fintrx Finance', 'Mobile Phone Installment Payment', 'Phone Installment Payment', 'Other'],
    'mCash': ['CEB - Ceylon Electricity Board', 'LECO - Lanka Electricity Company', 'Water Board - National Water Supply & Drainage Board', 'Mobitel Postpaid', 'Fintrex Finance', 'Fintrx Finance', 'Mobile Phone Installment Payment', 'Phone Installment Payment', 'Other'],
    'Dialog Pay': ['CEB - Ceylon Electricity Board', 'LECO - Lanka Electricity Company', 'Water Board - National Water Supply & Drainage Board', 'Dialog Television', 'Dialog Broadband', 'PickMe', 'GovPay', 'Department of Motor Traffic', 'Sri Lanka Police', 'Immigration and Emigration', 'Inland Revenue Department', 'Municipal Council Payment', 'Pradeshiya Sabha Payment', 'Other'],
    'FriMi': ['CEB - Ceylon Electricity Board', 'LECO - Lanka Electricity Company', 'Water Board - National Water Supply & Drainage Board', 'SLT - Sri Lanka Telecom', 'PickMe', 'Other'],
    'GovPay': ['Department of Motor Traffic', 'Sri Lanka Police', 'Immigration and Emigration', 'Inland Revenue Department', 'Municipal Council Payment', 'Pradeshiya Sabha Payment', 'Other']
  };
  const wallets = paymentOptionList_(settings || {}, 'PAYMENT_WALLETS', paymentWalletDefaults_());
  const builtIn = uniqueList_(Object.keys(defaults).reduce(function (all, wallet) { return all.concat(defaults[wallet] || []); }, []));
  wallets.forEach(function (wallet) {
    const allowed = defaults[wallet] || [];
    const persisted = Array.isArray(saved[wallet]) ? uniqueList_(saved[wallet]) : [];
    const custom = persisted.filter(function (service) { return builtIn.indexOf(service) < 0; });
    saved[wallet] = uniqueList_(allowed.concat(custom));
  });
  Object.keys(saved).forEach(function (wallet) {
    if (wallets.indexOf(wallet) < 0) delete saved[wallet];
  });
  return saved;
}

function applyPaymentSetupChange_(request) {
  const type = cleanText_(request && request.type).toUpperCase();
  const action = cleanText_(request && request.action).toUpperCase();
  const name = cleanText_(request && request.name);
  const oldName = cleanText_(request && request.oldName);
  const wallet = cleanText_(request && request.wallet);
  if (!['ADD', 'RENAME', 'DELETE'].includes(action)) throw new Error('Invalid payment setup action.');
  const ss = getSpreadsheet_(), settings = getSettings_(ss);
  if (type === 'WALLET_BILLER') {
    if (!wallet) throw new Error('Select the wallet.');
    if ((action === 'ADD' || action === 'RENAME') && !name) throw new Error('Enter a service / biller name.');
    if ((action === 'RENAME' || action === 'DELETE') && !oldName) throw new Error('Select a service / biller.');
    const map = paymentBillerMap_(settings);
    const list = uniqueList_(map[wallet] || []);
    if (action === 'ADD') {
      if (list.some(function (v) { return v.toLowerCase() === name.toLowerCase(); })) throw new Error('This service already exists for this wallet.');
      list.push(name);
    } else {
      const index = list.findIndex(function (v) { return v.toLowerCase() === oldName.toLowerCase(); });
      if (index < 0) throw new Error('Service not found for this wallet.');
      if (action === 'RENAME') {
        if (list.some(function (v, i) { return i !== index && v.toLowerCase() === name.toLowerCase(); })) throw new Error('That service name already exists for this wallet.');
        list[index] = name;
      } else {
        list.splice(index, 1);
      }
    }
    map[wallet] = uniqueList_(list);
    setSetting_(ss, 'PAYMENT_BILLERS_BY_WALLET', JSON.stringify(map));
    setSetting_(ss, 'PAYMENT_BILLERS', JSON.stringify(uniqueList_(paymentOptionList_(settings, 'PAYMENT_BILLERS', paymentBillerDefaults_()).concat(map[wallet]))));
    return { type:type, wallet:wallet, action:action, oldName:oldName, name:name, services:map[wallet] };
  }
  const key = type === 'WALLET' ? 'PAYMENT_WALLETS' : type === 'BILLER' ? 'PAYMENT_BILLERS' : type === 'METHOD' ? 'PAYMENT_METHODS' : type === 'BANK' ? 'PAYMENT_BANKS' : type === 'BANK_SERVICE' ? 'PAYMENT_BANK_SERVICES' : type === 'FINANCE' ? 'PAYMENT_FINANCE' : '';
  if (!key) throw new Error('Invalid payment option type.');
  if ((action === 'ADD' || action === 'RENAME') && !name) throw new Error('Enter a payment option name.');
  if ((action === 'RENAME' || action === 'DELETE') && !oldName) throw new Error('Select a payment option.');
  const options = paymentOptionList_(settings, key, paymentSetupDefaults_(type));
  if (action === 'ADD') {
    if (options.some(function (v) { return v.toLowerCase() === name.toLowerCase(); })) throw new Error('This payment option already exists.');
    options.push(name);
  } else {
    const index = options.findIndex(function (v) { return v.toLowerCase() === oldName.toLowerCase(); });
    if (index < 0) throw new Error('Payment option not found.');
    if (action === 'RENAME') {
      if (options.some(function (v, i) { return i !== index && v.toLowerCase() === name.toLowerCase(); })) throw new Error('That name already exists.');
      options[index] = name;
    } else {
      options.splice(index, 1);
    }
  }
  setSetting_(ss, key, JSON.stringify(uniqueList_(options)));
  if (type === 'WALLET') {
    const map = paymentBillerMap_(settings);
    if (action === 'ADD' && !map[name]) map[name] = [];
    if (action === 'RENAME') { map[name] = map[oldName] || []; delete map[oldName]; }
    if (action === 'DELETE') delete map[oldName];
    setSetting_(ss, 'PAYMENT_BILLERS_BY_WALLET', JSON.stringify(map));
  }
  if (type === 'BILLER') {
    const map = paymentBillerMap_(settings);
    Object.keys(map).forEach(function (w) {
      map[w] = uniqueList_((map[w] || []).map(function (v) {
        return action === 'RENAME' && v.toLowerCase() === oldName.toLowerCase() ? name : v;
      }).filter(function (v) { return !(action === 'DELETE' && v.toLowerCase() === oldName.toLowerCase()); }));
    });
    setSetting_(ss, 'PAYMENT_BILLERS_BY_WALLET', JSON.stringify(map));
  }
  return { type:type, action:action, oldName:oldName, name:name };
}

function submitPaymentSetupRequest(request) {
  const actor = paymentSetupRequester_(request && request.actorPin);
  const type = cleanText_(request && request.type).toUpperCase(), action = cleanText_(request && request.action).toUpperCase();
  const name = cleanText_(request && request.name), oldName = cleanText_(request && request.oldName), wallet = cleanText_(request && request.wallet);
  if (!['WALLET','BILLER','WALLET_BILLER','METHOD'].includes(type) || !['ADD','RENAME','DELETE'].includes(action) || (action !== 'DELETE' && !name) || ((action === 'RENAME' || action === 'DELETE') && !oldName) || (type === 'WALLET_BILLER' && !wallet)) throw new Error('Enter valid payment setup details.');
  return withLock_(function () {
    const sh = getOrCreateSheet_(getSpreadsheet_(), PAYMENT_SETUP_REQUESTS_SHEET_);
    ensureHeaders_(sh, ['Request ID','Requested At','Requested By','Account Role','Type','Action','Old Name','New Name','Wallet','Status','Approved By','Approved At']);
    const id = 'PSR-' + AppUtilities.getUuid().slice(0, 8).toUpperCase();
    sh.appendRow([id, new Date(), actor.name, actor.role, type, action, oldName, name, wallet, 'PENDING', '', '']);
    return { id:id, status:'PENDING' };
  });
}

function decidePaymentSetupRequest(request) {
  const actor = accountForPin_(request && request.actorPin), id = cleanText_(request && request.id), approved = request && request.approved === true;
  if (!actor || !isTopRole_(actor.role)) throw new Error('Only Master Owner or Super Admin can approve payment setup requests.');
  return withLock_(function () {
    const sh = getSpreadsheet_().getSheetByName(PAYMENT_SETUP_REQUESTS_SHEET_);
    if (!sh) throw new Error('Request not found.');
    const rows = sh.getDataRange().getValues(), head = rows[0].map(cleanText_);
    const idx = rows.slice(1).findIndex(function (r) { return cleanText_(r[0]) === id && cleanText_(r[head.indexOf('Status')]) === 'PENDING'; });
    if (idx < 0) throw new Error('This request is no longer pending.');
    const row = rows[idx + 1], get = function (label, fallback) { const i = head.indexOf(label); return i >= 0 ? row[i] : row[fallback]; };
    const result = approved ? applyPaymentSetupChange_({ type:get('Type',4), action:get('Action',5), oldName:get('Old Name',6), name:get('New Name',7), wallet:get('Wallet',8) }) : null;
    const statusCol = head.indexOf('Status') + 1, byCol = head.indexOf('Approved By') + 1, atCol = head.indexOf('Approved At') + 1;
    sh.getRange(idx + 2, statusCol || 10).setValue(approved ? 'APPROVED' : 'REJECTED');
    if (byCol > 0) sh.getRange(idx + 2, byCol).setValue(actor.name);
    if (atCol > 0) sh.getRange(idx + 2, atCol).setValue(new Date());
    return { approved:approved, result:result };
  });
}

function managePaymentOption(request) {
  const actor = accountForPin_(request && request.actorPin);
  if (!actor || !isTopRole_(actor.role)) throw new Error('Only Super Admin can change Payment Setup.');
  return withLock_(function () { return applyPaymentSetupChange_(request || {}); });
}

const __shanFinalManagePaymentOptionBase = managePaymentOption;
managePaymentOption = function(request) {
  const actor=accountForPin_(request&&request.actorPin);
  const allowed=actor&&(isTopRole_(actor.role)||(actor.permissions&&actor.permissions.payment===true)||(actor.permissions&&actor.permissions.settings===true));
  if(!allowed)throw new Error('Payment Setup permission is required.');
  const type=cleanText_(request&&request.type).toUpperCase(),action=cleanText_(request&&request.action).toUpperCase(),oldName=cleanText_(request&&request.oldName),name=cleanText_(request&&request.name);
  if(type!=='BILLER')return withLock_(function(){return applyPaymentSetupChange_(request||{});});
  if(!['ADD','RENAME','DELETE'].includes(action))throw new Error('Invalid payment setup action.');
  if((action==='ADD'||action==='RENAME')&&!name)throw new Error('Enter a service / biller name.');
  if((action==='RENAME'||action==='DELETE')&&!oldName)throw new Error('Select a service / biller.');
  return withLock_(function(){
    const ss=getSpreadsheet_(),settings=getSettings_(ss),options=paymentOptionList_(settings,'PAYMENT_BILLERS',paymentBillerDefaults_()),map=paymentBillerMap_(settings);
    if(action==='ADD'){
      if(options.some(function(v){return v.toLowerCase()===name.toLowerCase();}))throw new Error('This service / biller already exists.');
      options.push(name);
    }else{
      const index=options.findIndex(function(v){return v.toLowerCase()===oldName.toLowerCase();});
      if(index<0)throw new Error('Service / biller not found.');
      if(action==='RENAME'){
        if(options.some(function(v,i){return i!==index&&v.toLowerCase()===name.toLowerCase();}))throw new Error('That service / biller name already exists.');
        options[index]=name;
        Object.keys(map).forEach(function(wallet){map[wallet]=uniqueList_((map[wallet]||[]).map(function(item){return item.toLowerCase()===oldName.toLowerCase()?name:item;}));});
      }else{
        options.splice(index,1);
        Object.keys(map).forEach(function(wallet){map[wallet]=uniqueList_((map[wallet]||[]).filter(function(item){return item.toLowerCase()!==oldName.toLowerCase();}));});
      }
    }
    setSetting_(ss,'PAYMENT_BILLERS',JSON.stringify(uniqueList_(options)));
    setSetting_(ss,'PAYMENT_BILLERS_BY_WALLET',JSON.stringify(map));
    return{type:type,action:action,oldName:oldName,name:name};
  });
};












/* ================= Final SHAN requirements overrides ================= */
const SHAN_FINAL_TIERS_={FIRST_PURCHASE:{name:'First Purchase',days:547,validity:'18 months'},NORMAL:{name:'Normal',days:365,validity:'1 year'},VIP:{name:'VIP',days:1825,validity:'5 years'},VIP_PLUS:{name:'VIP Plus',days:3650,validity:'10 years'},VIPS:{name:'VIPS',days:9125,validity:'25 years'},SUPER_VIP:{name:'Super VIP',days:12775,validity:'35 years'},SUPER_VIP_PREMIER:{name:'Super VIP Premier',days:0,validity:'Unlimited'}};
const SHAN_FINAL_TIER_ORDER_=['FIRST_PURCHASE','NORMAL','VIP','VIP_PLUS','VIPS','SUPER_VIP','SUPER_VIP_PREMIER'];
function shanFinalBranchEnabled_(record){const b=String(record&&record.customerDetails&&record.customerDetails.businessType||'').toUpperCase();return branchReadAllowedForBusinessMode_(b)}
function shanFinalMachineLimit_(record){return shanFinalBranchEnabled_(record)?100:25}
function shanFinalActivationLimit_(record){return shanFinalBranchEnabled_(record)?25:3}
function shanFinalDiscountPercent_(normal,discount){const n=Number(normal),d=Number(discount);return n>0&&isFinite(d)?Math.max(0,Math.min(100,((n-d)/n)*100)):0}
function shanFinalPrices_(){try{return JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_GLOBAL_LICENSE_PRICES_V3')||'{}')}catch(e){return{}}}
function setGlobalCustomerLicensePriceFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),t=cleanText_(request&&request.licenseTier).toUpperCase();if(!a||a.role!=='OWNER')throw new Error('Only the Master Owner can save license prices.');if(!SHAN_FINAL_TIERS_[t])throw new Error('Select a valid license package.');const normal=request&&request.normalPrice!==''&&request.normalPrice!==undefined?Number(request.normalPrice):'',discount=request&&request.discountPrice!==''&&request.discountPrice!==undefined?Number(request.discountPrice):'',active=request&&request.discountActive===true;if(normal!==''&&(!isFinite(normal)||normal<0))throw new Error('Enter a valid Normal Price.');if(discount!==''&&(!isFinite(discount)||discount<0))throw new Error('Enter a valid Discount Price.');if(active&&(discount===''||normal===''))throw new Error('A discount can be activated only when both Normal Price and Discount Price are saved.');if(active&&discount>normal)throw new Error('Discount Price cannot exceed Normal Price.');const all=shanFinalPrices_();all[t]={normalPrice:normal,discountPrice:discount,discountActive:active,updatedAt:new Date().toISOString()};AppProperties.getScriptProperties().setProperty('SHAN_GLOBAL_LICENSE_PRICES_V3',JSON.stringify(all));return all[t]}
function getGlobalCustomerLicensePrices(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin);if(!a||a.role!=='OWNER')throw new Error('Only the Master Owner can view license prices.');const p=shanFinalPrices_();return{rows:SHAN_FINAL_TIER_ORDER_.map(t=>{const x=p[t]||{};return{licenseTier:t,name:SHAN_FINAL_TIERS_[t].name,validity:SHAN_FINAL_TIERS_[t].validity,days:SHAN_FINAL_TIERS_[t].days,normalPrice:x.normalPrice===undefined?'':x.normalPrice,discountPrice:x.discountPrice===undefined?'':x.discountPrice,discountActive:x.discountActive===true,discountPercent:x.discountActive?shanFinalDiscountPercent_(x.normalPrice,x.discountPrice):0}})}}
function getCustomerLicenseOffers(request){setShopContextFromRequest_(request||{});const s=activeShopCode_(),r=shopRecordForCode_(s);if(!r)throw new Error('Customer software not found.');const p=shanFinalPrices_(),used=r.firstPurchaseUsed===true||!!r.firstPurchaseAt||!!r.firstPurchaseKeyIssued,firstExpired=used&&!r.demoMode&&shopActivationKeyExpired_(r),eligible=used?(firstExpired?SHAN_FINAL_TIER_ORDER_.filter(t=>t!=='FIRST_PURCHASE'):[]):['FIRST_PURCHASE'];return eligible.map(t=>{const x=p[t]||{};if(x.normalPrice===''||x.normalPrice===undefined)return null;const active=x.discountActive===true&&x.discountPrice!==''&&x.discountPrice!==undefined;return{licenseTier:t,name:SHAN_FINAL_TIERS_[t].name,validity:SHAN_FINAL_TIERS_[t].validity,days:SHAN_FINAL_TIERS_[t].days,normalPrice:Number(x.normalPrice),discountPrice:active?Number(x.discountPrice):'',discountActive:active,discountPercent:active?shanFinalDiscountPercent_(x.normalPrice,x.discountPrice):0}}).filter(Boolean)}
function requestCustomerLicensePurchase(request){setShopContextFromRequest_(request||{});const s=activeShopCode_(),a=accountForPin_(request&&request.actorPin),t=cleanText_(request&&request.licenseTier).toUpperCase(),r=shopRecordForCode_(s),p=shanFinalPrices_();if(!s||!a||!r)throw new Error('Customer software context is required.');if(!SHAN_FINAL_TIERS_[t])throw new Error('Select a valid license package.');const firstUsed=r.firstPurchaseUsed===true||!!r.firstPurchaseAt||!!r.firstPurchaseKeyIssued,firstExpired=firstUsed&&!r.demoMode&&shopActivationKeyExpired_(r);if(t==='FIRST_PURCHASE'&&firstUsed)throw new Error('First Purchase is available only once.');if(t!=='FIRST_PURCHASE'&&(!firstUsed||!firstExpired))throw new Error('Other license types become available only after the First Purchase 18-month license has expired.');const x=p[t]||{};const amount=x.discountActive&&x.discountPrice!==''?Number(x.discountPrice):Number(x.normalPrice);if(!isFinite(amount)||amount<=0)throw new Error('This license package does not have a price configured by the Master.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PURCHASE_REQUESTS')||'[]')}catch(e){}const item={id:'LIC-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),shopCode:s,shopName:r.shopName||s,requestedBy:a.name,licenseTier:t,amount:amount,normalPrice:Number(x.normalPrice),discountPrice:x.discountActive?Number(x.discountPrice):'',discountActive:x.discountActive===true,createdAt:new Date().toISOString(),status:'PENDING_PAYMENT'};rows.push(item);AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PURCHASE_REQUESTS',JSON.stringify(rows));return{status:item.status,id:item.id,amount:amount,normalPrice:item.normalPrice,discountPrice:item.discountPrice,discountActive:item.discountActive}}
function submitCustomerLicensePaymentProof(request){setShopContextFromRequest_(request||{});const s=activeShopCode_(),a=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.requestId),amount=Number(request&&request.amount),slip=cleanText_(request&&request.slipDataUrl);if(!s||!a||!isFinite(amount)||amount<=0||!slip||slip.length>15000000)throw new Error('Enter the paid amount and upload the payment slip.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PURCHASE_REQUESTS')||'[]')}catch(e){}const q=rows.find(x=>x.id===id&&x.shopCode===s);if(!q)throw new Error('License purchase request not found.');if(Math.abs(Number(q.amount)-amount)>.01)throw new Error('Payment amount does not match the Master price.');let proofs=[];try{proofs=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PAYMENT_PROOFS')||'[]')}catch(e){}const item={id:'PAY-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),requestId:id,shopCode:s,shopName:q.shopName,requestedBy:a.name,licenseTier:q.licenseTier,amount:amount,slipDataUrl:slip,createdAt:new Date().toISOString(),status:'PENDING_REVIEW'};proofs.push(item);q.status='PAYMENT_SUBMITTED';q.paymentProofId=item.id;AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PURCHASE_REQUESTS',JSON.stringify(rows));AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PAYMENT_PROOFS',JSON.stringify(proofs));return item}
function generateLicenseKeyForTierFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),t=cleanText_(request&&request.licenseTier).toUpperCase();if(!a||a.role!=='OWNER')throw new Error('Only the Master Owner can generate license keys.');if(!SHAN_FINAL_TIERS_[t])throw new Error('Select a valid license package.');const shops=shopDatabaseConfig_(),r=shops[shop];if(!r)throw new Error('Customer shop not found.');if(r.demoMode)throw new Error('Trial/Demo must be paid and approved before a license key is issued.');if(t==='FIRST_PURCHASE'&&(r.firstPurchaseUsed||r.firstPurchaseAt||r.firstPurchaseKeyIssued))throw new Error('First Purchase can be issued only once.');let k=shopActivationKey_();while(Object.keys(shops).some(c=>c!==shop&&normalizeActivationKey_(shops[c]&&shops[c].activationCode)===normalizeActivationKey_(k)))k=shopActivationKey_();r.licenseTier=t;r.activationCode=k;r.activationCodeExpiresAt=shopLicenseTierExpiresAt_(t);r.licenseActivationUses=0;r.licenseActivationLimit=shanFinalActivationLimit_(r);r.machineLimit=shanFinalMachineLimit_(r);r.licensedDevices=Array.isArray(r.licensedDevices)?r.licensedDevices:[];if(t==='FIRST_PURCHASE'){r.firstPurchaseUsed=true;r.firstPurchaseAt=r.firstPurchaseAt||new Date().toISOString();r.firstPurchaseKeyIssued=true}r.active=true;r.status='ACTIVE';r.updatedAt=new Date().toISOString();shops[shop]=r;saveShopDatabaseConfig_(shops);return{shopCode:shop,licenseTier:t,activationCode:k,activationCodeExpiresAt:r.activationCodeExpiresAt,status:'ACTIVE',activationLimit:r.licenseActivationLimit,machineLimit:r.machineLimit}}
function listLicensePurchaseRequestsFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin);if(!a||a.role!=='OWNER')throw new Error('Only the Master Owner can view license requests.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PURCHASE_REQUESTS')||'[]')}catch(e){}return rows.slice().reverse()}
function listLicensePaymentProofsFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin);if(!a||a.role!=='OWNER')throw new Error('Only the Master Owner can view payment slips.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PAYMENT_PROOFS')||'[]')}catch(e){}return rows.map(x=>({id:x.id,shopCode:x.shopCode,shopName:x.shopName,requestedBy:x.requestedBy,licenseTier:x.licenseTier,amount:x.amount,slipDataUrl:x.slipDataUrl,createdAt:x.createdAt,status:x.status})).reverse()}
function decideLicensePaymentProofFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.id),approved=request&&request.approved===true;if(!a||a.role!=='OWNER')throw new Error('Only the Master Owner can review payment slips.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_LICENSE_PAYMENT_PROOFS')||'[]')}catch(e){}const item=rows.find(x=>x.id===id);if(!item)throw new Error('Payment slip not found.');if(!approved){item.status='REJECTED';item.reviewedAt=new Date().toISOString();AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PAYMENT_PROOFS',JSON.stringify(rows));return item}const result=generateLicenseKeyForTierFromMaster({actorPin:request.actorPin,shopCode:item.shopCode,licenseTier:item.licenseTier});item.status='APPROVED';item.reviewedAt=new Date().toISOString();item.activationCode=result.activationCode;item.activationCodeExpiresAt=result.activationCodeExpiresAt;AppProperties.getScriptProperties().setProperty('SHAN_LICENSE_PAYMENT_PROOFS',JSON.stringify(rows));return item}
function activateCustomerLicenseFromUi(request){setShopContextFromRequest_(request||{});const s=activeShopCode_(),key=cleanText_(request&&request.activationKey),pin=requestPinValue_(request),deviceId=cleanText_(request&&request.deviceId)||'UNKNOWN';if(!s)throw new Error('Customer software link is required.');const a=accountForPin_(pin),r=shopRecordForCode_(s);if(!a||a.role!=='SUPER_ADMIN')throw new Error('Only the Customer Super Admin can activate this software.');if(!r||r.demoMode)throw new Error('Trial/Demo must be converted to a paid license first.');if(!shopActivationKeyMatches_(r,key))throw new Error('This License Key does not belong to this customer software or has expired.');const devices=Array.isArray(r.licensedDevices)?r.licensedDevices:[];if(devices.indexOf(deviceId)<0){if(devices.length>=Number(r.machineLimit||shanFinalMachineLimit_(r)))throw new Error('This software has reached its licensed machine capacity of '+Number(r.machineLimit||shanFinalMachineLimit_(r))+'.');const isReinstall=Array.isArray(r.retiredDevices)&&r.retiredDevices.indexOf(deviceId)>=0;const limit=Number(r.licenseActivationLimit||shanFinalActivationLimit_(r));if(isReinstall&&Number(r.licenseActivationUses||0)>=limit)throw new Error('This License Key has reached its activation/reinstallation limit of '+limit+'. Contact SHAN POS SYSTEMS Support or request a new key.');if(isReinstall)r.licenseActivationUses=Number(r.licenseActivationUses||0)+1;devices.push(deviceId);r.licensedDevices=devices}r.lastActivatedDeviceId=deviceId;r.lastActivationAt=new Date().toISOString();r.active=true;r.status='ACTIVE';const shops=shopDatabaseConfig_();shops[s]=r;saveShopDatabaseConfig_(shops);return{shopCode:s,licenseTier:r.licenseTier,expiresAt:r.activationCodeExpiresAt,status:'ACTIVE',activationUses:Number(r.licenseActivationUses||0),activationLimit:Number(r.licenseActivationLimit||shanFinalActivationLimit_(r)),machineCount:devices.length,machineLimit:Number(r.machineLimit||shanFinalMachineLimit_(r))}}
function retireCustomerDeviceForReinstall(request){setShopContextFromRequest_(request||{});const s=activeShopCode_(),a=accountForPin_(request&&request.actorPin),deviceId=cleanText_(request&&request.deviceId),r=shopRecordForCode_(s);if(!s||!a||a.role!=='SUPER_ADMIN'||!r||!deviceId)throw new Error('Only Customer Super Admin can retire a device.');r.retiredDevices=Array.isArray(r.retiredDevices)?r.retiredDevices:[];r.licensedDevices=Array.isArray(r.licensedDevices)?r.licensedDevices:[];r.licensedDevices=r.licensedDevices.filter(x=>x!==deviceId);if(r.retiredDevices.indexOf(deviceId)<0)r.retiredDevices.push(deviceId);const shops=shopDatabaseConfig_();shops[s]=r;saveShopDatabaseConfig_(shops);return{deviceId,remainingMachines:r.licensedDevices.length,machineLimit:Number(r.machineLimit||shanFinalMachineLimit_(r))}}
function requestReplacementLicenseKeyFromCustomer(request){setShopContextFromRequest_(request||{});const s=activeShopCode_(),a=accountForPin_(request&&request.actorPin),r=shopRecordForCode_(s),oldKey=cleanText_(request&&request.oldLicenseKey),email=cleanText_(request&&request.email);if(!s||!a||a.role!=='SUPER_ADMIN'||!r)throw new Error('Only the Customer Super Admin can request a replacement key.');if(!oldKey||!email)throw new Error('Enter the old License Key and the customer email address.');if(normaliseActivationKey_(oldKey)!==normaliseActivationKey_(r.activationCode))throw new Error('The old License Key does not match this customer software.');const p=shanFinalPrices_(),x=p[String(r.licenseTier||'').toUpperCase()]||{},base=x.discountActive&&x.discountPrice!==''?Number(x.discountPrice):Number(x.normalPrice);if(!isFinite(base)||base<=0)throw new Error('The current Master price is not configured.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_REPLACEMENT_KEY_REQUESTS')||'[]')}catch(e){}const item={id:'REPL-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),shopCode:s,licenseTier:r.licenseTier,email:email,oldLicenseKey:oldKey,currentPrice:base,replacementPrice:round2_(base/2),createdAt:new Date().toISOString(),status:'PENDING_MASTER_REVIEW'};rows.push(item);AppProperties.getScriptProperties().setProperty('SHAN_REPLACEMENT_KEY_REQUESTS',JSON.stringify(rows));return item}
function listReplacementKeyRequestsFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin);if(!a||a.role!=='OWNER')throw new Error('Only Master can view replacement-key requests.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_REPLACEMENT_KEY_REQUESTS')||'[]')}catch(e){}return rows.slice().reverse()}
/* Branch creation is a support-assisted workflow. The old direct-save endpoint is retained only for compatibility. */
function requestCustomerBranchCreation(request){setShopContextFromRequest_(request||{});const a=accountForPin_(request&&request.actorPin),s=activeShopCode_(),r=shopRecordForCode_(s);if(!a||a.role!=='SUPER_ADMIN')throw new Error('Only Customer Super Admin can start branch creation.');if(!r||!shanFinalBranchEnabled_(r))throw new Error('This business type does not allow branches.');const rows=customerBranches_();const limit=Number(r.branchLimit||25);if(r.branchApprovalRequired&&(!r.branchExpansionApproved||!r.branchExpansionPaymentConfirmed))throw new Error('This account has requested more than 25 branches. Master approval and separate payment are required before branch creation.');if(rows.length>=limit)throw new Error('The approved branch capacity is '+limit+'.');let q=[];try{q=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_BRANCH_SUPPORT_REQUESTS')||'[]')}catch(e){}const item={id:'BRREQ-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),shopCode:s,requestedBy:a.name,name:cleanText_(request&&request.name),province:cleanText_(request&&request.province),district:cleanText_(request&&request.district),divisionalSecretariat:cleanText_(request&&request.divisionalSecretariat),branchCode:normaliseShopCode_(request&&request.branchCode),status:'PENDING_SUPPORT',createdAt:new Date().toISOString()};if(!item.name||!item.branchCode)throw new Error('Branch Name and Branch Code are mandatory.');if(rows.some(x=>normaliseShopCode_(x.branchCode)===item.branchCode))throw new Error('Branch Code already exists.');q.push(item);AppProperties.getScriptProperties().setProperty('SHAN_BRANCH_SUPPORT_REQUESTS',JSON.stringify(q));return item}
function listBranchSupportRequestsFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin);if(!a||a.role!=='OWNER')throw new Error('Only Master can view branch support requests.');let q=[];try{q=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_BRANCH_SUPPORT_REQUESTS')||'[]')}catch(e){}return q.slice().reverse()}
function approveCustomerBranchSupport(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.requestId);if(!a||a.role!=='OWNER')throw new Error('Only Master can approve a branch.');let q=[];try{q=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_BRANCH_SUPPORT_REQUESTS')||'[]')}catch(e){}const item=q.find(x=>x.id===id);if(!item)throw new Error('Branch request not found.');setActiveShop_(item.shopCode);const r=shopRecordForCode_(item.shopCode),rows=customerBranches_();if(rows.some(x=>normaliseShopCode_(x.branchCode)===item.branchCode)){setActiveShop_('');throw new Error('Branch Code already exists.');}const branch={id:'BR-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),name:item.name,province:item.province,district:item.district,divisionalSecretariat:item.divisionalSecretariat,branchCode:item.branchCode,active:true,status:'ACTIVE',createdAt:new Date().toISOString(),createdBy:a.name,supportVerifiedBy:a.name,uniqueLink:(process.env.URL||process.env.DEPLOY_PRIME_URL||'')+'/shop/'+encodeURIComponent(item.shopCode)+'/branch/'+encodeURIComponent(item.branchCode)};rows.push(branch);AppProperties.getScriptProperties().setProperty(customerBranchesPropertyKey_(),JSON.stringify(rows));item.status='APPROVED';item.approvedAt=new Date().toISOString();item.approvedBy=a.name;AppProperties.getScriptProperties().setProperty('SHAN_BRANCH_SUPPORT_REQUESTS',JSON.stringify(q));setActiveShop_('');return branch}
function setBranchExpansionApprovalFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),approved=request&&request.approved===true,paid=request&&request.paymentConfirmed===true;if(!a||a.role!=='OWNER')throw new Error('Only Master can approve branch expansion.');const shops=shopDatabaseConfig_(),r=shops[shop];if(!r)throw new Error('Customer shop not found.');if(Number(r.branchCount||1)<=25)throw new Error('This account does not require branch expansion approval.');r.branchExpansionApproved=approved;r.branchExpansionPaymentConfirmed=approved&&paid;r.branchLimit=approved&&paid?100:25;r.updatedAt=new Date().toISOString();shops[shop]=r;saveShopDatabaseConfig_(shops);return{shopCode:shop,branchExpansionApproved:r.branchExpansionApproved,branchExpansionPaymentConfirmed:r.branchExpansionPaymentConfirmed,branchLimit:r.branchLimit}}
/* Support access is temporary and scoped. It never changes a support member's own workspace link. */
function enableTemporaryCustomerSupportAccess(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),minutes=Math.max(5,Math.min(1440,Number(request&&request.minutes||60)));if(!a||a.role!=='OWNER')throw new Error('Only Master can authorize customer support access.');const r=shopRecordForCode_(shop);if(!r||!shopRecordIsActive_(r))throw new Error('Customer software is not active.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_TEMP_SUPPORT_ACCESS')||'[]')}catch(e){}const item={id:'SUPACC-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),shopCode:shop,supporter:a.name,expiresAt:new Date(Date.now()+minutes*60000).toISOString(),scope:Array.isArray(request&&request.scope)?request.scope:['support'],active:true};rows.push(item);AppProperties.getScriptProperties().setProperty('SHAN_TEMP_SUPPORT_ACCESS',JSON.stringify(rows));return item}
function revokeTemporaryCustomerSupportAccess(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.id);if(!a||a.role!=='OWNER')throw new Error('Only Master can revoke support access.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_TEMP_SUPPORT_ACCESS')||'[]')}catch(e){}rows.forEach(x=>{if(x.id===id)x.active=false});AppProperties.getScriptProperties().setProperty('SHAN_TEMP_SUPPORT_ACCESS',JSON.stringify(rows));return true}

function authorizeSupportCustomerAppSessionFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),shop=normaliseShopCode_(request&&request.shopCode),supportId=cleanText_(request&&request.supportId),minutes=Math.max(5,Math.min(240,Number(request&&request.minutes||60)));if(!a||a.role!=='OWNER')throw new Error('Only Master can authorize temporary customer support access.');const customer=shopRecordForCode_(shop);if(!customer||!shopRecordIsActive_(customer))throw new Error('Customer software is not active.');let masterCfg=posAccessConfig_(),support=masterCfg.accounts.find(x=>x.id===supportId&&x.role==='SUPPORT'&&x.active!==false);if(!support)throw new Error('Support member not found.');const cfgKey='POS_ACCESS_CONFIG_SHOP_'+shop;let cfg;try{cfg=JSON.parse(AppProperties.getScriptProperties().getProperty(cfgKey)||'')}catch(e){cfg=null}if(!cfg||!Array.isArray(cfg.accounts)){setActiveShop_(shop);cfg=posAccessConfig_();setActiveShop_('')}const tempId='TEMP-SUPPORT-'+AppUtilities.getUuid().slice(0,8).toUpperCase(),expires=new Date(Date.now()+minutes*60000).toISOString(),scope=Array.isArray(request&&request.scope)&&request.scope.length?request.scope:['support'];const perms={};POS_PERMISSION_KEYS_.forEach(k=>perms[k]=scope.indexOf(k)>=0);perms.sale=scope.indexOf('sale')>=0;perms.products=scope.indexOf('products')>=0;perms.reports=scope.indexOf('reports')>=0;perms.settings=false;perms.companyDetails=false;perms.manageAccounts=false;cfg.accounts=cfg.accounts.filter(x=>!(x.supportTemporary===true&&x.supportOwnerId===support.id));cfg.accounts.push({id:tempId,name:support.name+' (Temporary Support)',role:'SUPPORT',supportRole:support.supportRole||'SUPPORT',supportAuthority:support.supportAuthority||'',pinHash:support.pinHash,parentId:'',active:true,permissions:perms,supportTemporary:true,supportOwnerId:support.id,supportExpiresAt:expires});AppProperties.getScriptProperties().setProperty(cfgKey,JSON.stringify(cfg));const token='pos-session:'+AppUtilities.getUuid();AppCache.getScriptCache().put(token,JSON.stringify({accountId:tempId,shopCode:shop,created:new Date().toISOString(),supportExpiresAt:expires}),Math.ceil(minutes*60));return{token:token,shopCode:shop,expiresAt:expires,scope:scope,supportName:support.name}};
function loginWithSupportAppSession(request){const token=cleanText_(request&&request.token),sess=posAppSessionForToken_(token);if(!sess||!sess.supportExpiresAt||new Date(sess.supportExpiresAt).getTime()<=Date.now())throw new Error('Temporary support authorization has expired.');setActiveShop_(sess.shopCode);const cfg=posAccessConfig_(),a=cfg.accounts.find(x=>x.id===sess.accountId&&x.active!==false&&x.supportTemporary===true);if(!a||new Date(a.supportExpiresAt).getTime()<=Date.now())throw new Error('Temporary support authorization is no longer active.');return sessionPayloadForAccount_(a,token)}
function approveReplacementLicenseKeyFromMaster(request){setActiveShop_('');const a=accountForPin_(request&&request.actorPin),id=cleanText_(request&&request.id);if(!a||a.role!=='OWNER')throw new Error('Only Master can approve replacement keys.');let rows=[];try{rows=JSON.parse(AppProperties.getScriptProperties().getProperty('SHAN_REPLACEMENT_KEY_REQUESTS')||'[]')}catch(e){}const q=rows.find(x=>x.id===id);if(!q)throw new Error('Replacement request not found.');const result=generateLicenseKeyForTierFromMaster({actorPin:request.actorPin,shopCode:q.shopCode,licenseTier:q.licenseTier});q.status='APPROVED';q.approvedAt=new Date().toISOString();q.activationCode=result.activationCode;q.activationCodeExpiresAt=result.activationCodeExpiresAt;AppProperties.getScriptProperties().setProperty('SHAN_REPLACEMENT_KEY_REQUESTS',JSON.stringify(rows));return q}
configureDatabaseFromUi=function(request){const shop=normaliseShopCode_(request&&request.shopCode);if(shop)setActiveShop_(shop);const ok=!!(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY);if(!ok)throw new Error('Supabase is not configured on Netlify. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.');return{configured:true,projectId:process.env.SUPABASE_URL||'',shopCode:shop||'DEFAULT'}};
/* ---- Final cross-category enforcement / workspace overrides ---- */
const __shanMasterDashboardCurrent=getMasterShopDashboard;getMasterShopDashboard=function(actorPin){const r=__shanMasterDashboardCurrent(actorPin),base=process.env.URL||process.env.DEPLOY_PRIME_URL||'';(r.shops||[]).forEach(x=>{if(x.shopCode)x.link=base+'/shop/'+encodeURIComponent(x.softwareCode||x.shopCode);const rec=shopRecordForCode_(x.shopCode);if(rec){x.workspaceType=cleanText_(rec.workspaceType);x.branchCount=Number(rec.branchCount||rec.customerDetails&&rec.customerDetails.branchCount||1);x.branchLimit=Number(rec.branchLimit||25)}});return r};
const __shanCreateShopCurrent=createShopLinkFromMaster;
createShopLinkFromMaster=function(request){const r=request||{},mode=cleanText_(r.customerDetails&&r.customerDetails.businessType).toUpperCase(),branchCount=Math.max(1,Math.floor(Number(r.branchCount||r.customerDetails&&r.customerDetails.branchCount||1))),branchEnabled=branchReadAllowedForBusinessMode_(mode);if(!cleanText_(r.softwareCode))throw new Error('Master must enter a unique Software / Link Code.');if(!branchEnabled&&branchCount!==1)throw new Error('Sole Proprietorship / individual business cannot create branches.');if(branchEnabled&&branchCount<4)throw new Error('Branch-enabled business accounts require at least 4 branches.');if(branchCount>100)throw new Error('Maximum approved branch capacity is 100.');const copy=Object.assign({},r,{branchCount:branchCount,customerDetails:Object.assign({},r.customerDetails||{},{businessType:mode,branchCount:branchCount,businessDetails:cleanText_(r.customerDetails&&r.customerDetails.businessDetails)}),branchApprovalRequired:branchCount>25,branchExtraPaymentRequired:branchCount>25});if(copy.adminPermissions)copy.adminPermissions=Object.assign({},copy.adminPermissions);copy.adminPermissions=Object.assign({},copy.adminPermissions||{}, {demoMode:false});copy.demoTrialDays=7;const out=__shanCreateShopCurrent(copy);const shops=shopDatabaseConfig_(),code=normaliseShopCode_(out.shopCode),rec=shops[code];if(rec){rec.customerDetails=Object.assign({},rec.customerDetails||{}, {businessDetails:cleanText_(r.customerDetails&&r.customerDetails.businessDetails),branchCount:branchCount});rec.branchCount=branchCount;rec.branchLimit=branchCount>25?100:25;rec.branchApprovalRequired=branchCount>25;rec.branchExtraPaymentRequired=branchCount>25;rec.machineLimit=branchEnabled?100:25;rec.licenseActivationLimit=branchEnabled?25:3;rec.demoMode=true;rec.demoTrialDays=Math.min(90,Math.max(7,Math.floor(Number(r.demoTrialDays||7))));rec.demoExpiresAt=new Date(Date.now()+rec.demoTrialDays*86400000).toISOString();rec.activationCode='';rec.activationCodeExpiresAt='';rec.licenseTier='FIRST_PURCHASE';saveShopDatabaseConfig_(shops);out.shopUrl=(process.env.URL||process.env.DEPLOY_PRIME_URL||'')+'/shop/'+encodeURIComponent(rec.softwareCode||code);out.demoMode=!!rec.demoMode;out.demoTrialDays=Number(rec.demoTrialDays||0);out.branchCount=branchCount;out.branchLimit=Number(rec.branchLimit||25);out.branchApprovalRequired=!!rec.branchApprovalRequired;out.machineLimit=Number(rec.machineLimit||25);out.licenseActivationLimit=Number(rec.licenseActivationLimit||3)}return out};
const __shanSupportCreateCurrent=createMasterSupportMember;
createMasterSupportMember=function(request){const r=request||{},roles={SUPPORT_DIRECTOR:{label:'Support Director',authority:'90%'},SUPPORT_MANAGER:{label:'Support Manager',authority:'80%'},CUSTOMER_RELATIONS_MANAGER:{label:'Customer Relations Manager',authority:'70%'},TECHNICAL_SUPPORT_MANAGER:{label:'Technical Support Manager',authority:'60%'},ACCOUNT_LICENSE_MANAGER:{label:'Account & License Manager',authority:'45%'},OPERATIONS_ESCALATION_OFFICER:{label:'Operations & Escalation Officer',authority:'30%'}};const role=cleanText_(r.role).toUpperCase();if(!roles[role])throw new Error('Select a valid Support Team role.');const base=__shanSupportCreateCurrent(Object.assign({},r,{role:'SUPPORT_AGENT'}));const cfg=posAccessConfig_(),acc=cfg.accounts.find(a=>a.id===base.id);if(acc){acc.supportRole=role;acc.supportAuthority=roles[role].authority;acc.permissions={customerSupport:true,reportsView:['SUPPORT_DIRECTOR','SUPPORT_MANAGER'].includes(role),workAssignment:['SUPPORT_DIRECTOR','SUPPORT_MANAGER','OPERATIONS_ESCALATION_OFFICER'].includes(role),deploymentAssist:role==='SUPPORT_DIRECTOR',permissionApproval:role==='SUPPORT_DIRECTOR',customerSoftwareManagement:false};saveAccessConfig_(cfg)}const workspaceCode='SUPW-'+AppUtilities.getUuid().replace(/-/g,'').slice(0,10).toUpperCase(),shops=shopDatabaseConfig_(),workspaceName=cleanText_(r.workspaceName)||cleanText_(r.name)+' Workspace';shops[workspaceCode]={shopName:workspaceName,softwareCode:workspaceCode,workspaceType:'SUPPORT',supportOwnerId:base.id,supportOwnerName:cleanText_(r.name),supportRole:role,active:true,status:'ACTIVE',demoMode:true,demoTrialDays:36500,demoExpiresAt:'',licenseTier:'SUPER_VIP_PREMIER',customerDetails:{businessType:'SUPPORT_WORKSPACE'},branchLimit:1,machineLimit:25,licenseActivationLimit:3,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};saveShopDatabaseConfig_(shops);const ac={version:3,moduleVisibility:{},accounts:[{id:base.id,name:cleanText_(r.name),role:'SUPPORT',supportRole:role,supportAuthority:roles[role].authority,pinHash:pinHash_(r.pin),parentId:'',active:true,workspaceOwner:true,permissions:{sale:true,reprint:true,payment:true,invoice:true,quotation:true,jobNotes:true,returns:true,purchase:true,reports:true,products:true,stockQuantity:true,stockOrder:true,stockNewBill:true,stockInvoice:true,companyDetails:true,settings:true,tools:true,manageAccounts:false}}]};AppProperties.getScriptProperties().setProperty('POS_ACCESS_CONFIG_SHOP_'+workspaceCode,JSON.stringify(ac));const link=(process.env.URL||process.env.DEPLOY_PRIME_URL||'')+'/shop/'+encodeURIComponent(workspaceCode)+'?support='+encodeURIComponent(base.supportCode);return Object.assign(base,{role:role,authority:roles[role].authority,workspaceCode:workspaceCode,workspaceName:workspaceName,link:link})};
const __shanSaveCompanyCurrent=saveCompanyDetails;
saveCompanyDetails=function(request){const r=request||{},s=activeShopCode_(),record=s?shopRecordForCode_(s):null;if(record&&record.workspaceType!=='SUPPORT'&&record.customerDetails&&record.customerDetails.businessType){const locked=record.customerDetails.businessType;r.businessMode=locked;r.branchManagementEnabled=branchReadAllowedForBusinessMode_(locked)}return __shanSaveCompanyCurrent(r)};
const __shanPublicSettingsCurrent=publicSettings_;
publicSettings_=function(settings){const out=__shanPublicSettingsCurrent(settings),s=activeShopCode_(),r=s?shopRecordForCode_(s):null;if(r){out.machineLimit=Number(r.machineLimit||shanFinalMachineLimit_(r));out.machineCount=Array.isArray(r.licensedDevices)?r.licensedDevices.length:0;out.licenseActivationUses=Number(r.licenseActivationUses||0);out.licenseActivationLimit=Number(r.licenseActivationLimit||shanFinalActivationLimit_(r));out.branchCount=Number(r.branchCount||r.customerDetails&&r.customerDetails.branchCount||1);out.branchLimit=Number(r.branchLimit||25);out.branchApprovalRequired=!!r.branchApprovalRequired;out.workspaceType=cleanText_(r.workspaceType);out.supportOwnerName=cleanText_(r.supportOwnerName)}return out};
const __shanLoginCurrent=loginWithPin;
loginWithPin=function(request){const r=Object.assign({},request||{});if(!r.deviceId)r.deviceId='browser-'+AppUtilities.getUuid();const result=__shanLoginCurrent(r);if(activeShopCode_()&&result.role==='SUPER_ADMIN'&&!String(activeShopCode_()).startsWith('SUPW-')){try{activateCustomerLicenseFromUi({shopCode:activeShopCode_(),pin:r.pin,activationKey:r.activationKey,deviceId:r.deviceId})}catch(e){throw e}}return result};
const __shanAccountForPinCurrent=accountForPin_;
accountForPin_=function(pin){const a=__shanAccountForPinCurrent(pin);if(a&&a.supportRole&&a.role==='SUPPORT'){const token=cleanText_(pin&&typeof pin==='object'?(pin.token||pin.actorPin||pin.pin):pin);if(token.indexOf('pos-session:')===0){const sess=posAppSessionForToken_(token),ws=sess&&sess.shopCode?shopRecordForCode_(sess.shopCode):null;if(a.supportTemporary&&a.supportExpiresAt&&new Date(a.supportExpiresAt).getTime()<=Date.now())throw new Error('Temporary support authorization has expired.');if(ws&&ws.workspaceType==='SUPPORT'&&ws.supportOwnerId!==a.id)throw new Error('Support workspace ownership mismatch.')}}return a};
