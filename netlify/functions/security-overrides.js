'use strict';

/* Security and Netlify-runtime corrections applied after the migrated legacy
   business code is loaded.  Keeping this isolated makes the migration audit
   explicit and prevents the original Apps Script defaults from becoming live
   credentials. */
(function () {
  const LEGACY_OWNER_HASH = '2926a2731f4b312c08982cacf8061eb14bf65c1a87cc5d70e864e079c6220731';
  const baseAccessConfig = posAccessConfig_;

  posAccessConfig_ = function () {
    const config = baseAccessConfig.apply(this, arguments);
    if (!activeShopCode_() && Array.isArray(config.accounts) && config.accounts.some(a => a.role === 'OWNER' && a.pinHash === LEGACY_OWNER_HASH)) {
      config.accounts = config.accounts.filter(a => !(a.role === 'OWNER' && a.pinHash === LEGACY_OWNER_HASH));
      AppProperties.getScriptProperties().setProperty('POS_ACCESS_CONFIG', JSON.stringify(config));
    }
    return config;
  };

  globalThis.bootstrapMasterOwner = function (request) {
    const supplied = String(request && request.bootstrapToken || '');
    const expected = String(process.env.MASTER_BOOTSTRAP_TOKEN || '');
    if (expected.length < 24 || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      throw new Error('Master bootstrap token is invalid.');
    }
    setActiveShop_('');
    const config = posAccessConfig_();
    if ((config.accounts || []).some(a => a.role === 'OWNER' && a.active !== false)) throw new Error('A Master Owner already exists. Use My Profile to change its PIN.');
    const username = cleanText_(request && request.username);
    const pin = cleanText_(request && request.pin);
    if (!/^[A-Za-z0-9 ._-]{3,60}$/.test(username)) throw new Error('Enter a valid Master username.');
    if (!/^\d{6}$/.test(pin)) throw new Error('Master PIN must be exactly 6 digits.');
    config.accounts = config.accounts || [];
    config.accounts.unshift({ id:'owner-'+AppUtilities.getUuid(), name:username, role:'OWNER', pinHash:pinHash_(pin), parentId:'', active:true, firstLoginCompleted:true, permissions:allPermissions_() });
    AppProperties.getScriptProperties().setProperty('POS_ACCESS_CONFIG', JSON.stringify(config));
    return { created:true, username:username };
  };

  const baseInitialData = getInitialData;
  getInitialData = function (request) {
    setShopContextFromRequest_(request || {});
    if (!accountForPin_(request && request.actorPin)) throw new Error('Please log in again.');
    return baseInitialData(request);
  };

  globalThis.generateShopActivationKeyForMaster = function (request) {
    return generateShopActivationKeyFromMaster(request && request.actorPin ? request.actorPin : request);
  };
  globalThis.authorizeSupportCustomerSessionFromMaster = function (request) {
    return authorizeSupportCustomerAppSessionFromMaster(request || {});
  };
  globalThis.loginWithSupportSession = function (request) {
    const token = cleanText_(request && request.token);
    if (!token) throw new Error('Temporary support session is missing.');
    setShopContextFromRequest_({ actorPin:token });
    const account = accountForPin_(token);
    if (!account || account.role !== 'SUPPORT') throw new Error('Temporary support session is invalid or expired.');
    return sessionPayloadForAccount_(account, token);
  };
  globalThis.logoutLoginSession = function (request) {
    const token = cleanText_(request && (request.actorPin || request.token));
    if (token) AppCache.getScriptCache().remove(token);
    return { loggedOut:true };
  };

  function saveMasterNotification_(kind, status, customerShopCode, supportAccountId, title, details) {
    const rows = dbReq('POST', 'master_notifications', '', [{
      kind:String(kind), status:String(status || 'OPEN'), customer_shop_code:customerShopCode || null,
      support_account_id:supportAccountId || null, title:String(title), details:details || {}
    }]);
    return rows && rows[0] || null;
  }

  /* A customer request is visible to Master and Support as a notification only.
     It never gives Support an API token or access to customer data. */
  globalThis.submitCustomerSupportRequest = function (request) {
    setShopContextFromRequest_(request || {});
    const actor = accountForPin_(request && request.actorPin), shop = activeShopCode_();
    const message = cleanText_(request && request.message);
    const category = cleanText_(request && request.category) || 'GENERAL_SUPPORT';
    if (!actor || !shop || actor.role === 'SUPPORT' || actor.role === 'OWNER') throw new Error('Only an authenticated customer account can submit this request.');
    if (message.length < 3 || message.length > 4000) throw new Error('Enter a support request between 3 and 4000 characters.');
    return saveMasterNotification_('CUSTOMER_REQUEST', 'OPEN', shop, null, 'Customer support request: '+category, { category:category, message:message, requestedBy:actor.name, audience:'MASTER_AND_SUPPORT_NOTIFICATION_ONLY' });
  };

  globalThis.listMasterNotifications = function (request) {
    setActiveShop_('');
    const actor = accountForPin_(request && request.actorPin);
    if (!actor || actor.role !== 'OWNER') throw new Error('Only the Master Owner can view workflow notifications.');
    return dbReq('GET', 'master_notifications', 'select=*&order=created_at.desc&limit=500');
  };

  globalThis.listSupportNotifications = function (request) {
    const actor = accountForPin_(request && request.actorPin);
    if (!actor || actor.role !== 'SUPPORT') throw new Error('Only Support Team members can view support notifications.');
    const rows = dbReq('GET', 'master_notifications', 'kind=eq.CUSTOMER_REQUEST&status=eq.OPEN&select=id,customer_shop_code,title,created_at&order=created_at.desc&limit=200');
    return rows || [];
  };

  /* Every customer-system action taken through a Master-authorized temporary
     Support session is reported to Master.  Normal personal Support workspaces
     are intentionally excluded. */
  globalThis.recordSupportOperation_ = function (account, action) {
    if (!account || account.role !== 'SUPPORT' || account.supportTemporary !== true) return;
    const shop = activeShopCode_();
    if (!shop) return;
    saveMasterNotification_('SUPPORT_ACTION_REPORT', 'OPEN', shop, account.supportOwnerId || account.id, 'Temporary Support action: '+String(action), { supportName:account.name, action:String(action), recordedAt:new Date().toISOString() });
  };

  globalThis.recordCustomerRequest_ = function (account, action) {
    if (!account || account.role === 'OWNER' || account.role === 'SUPPORT' || !String(action).startsWith('request')) return;
    const shop = activeShopCode_();
    if (!shop) return;
    saveMasterNotification_('CUSTOMER_REQUEST', 'OPEN', shop, null, 'Customer workflow request: '+String(action), { requestedBy:account.name, action:String(action), audience:'MASTER_AND_SUPPORT_NOTIFICATION_ONLY' });
  };

  /* A temporary Support token may be used only for the customer workspace and
     for the explicit permission scope selected by Master. */
  const baseAccountForPin = accountForPin_;
  accountForPin_ = function (pin) {
    const account = baseAccountForPin(pin);
    if (account && account.role === 'SUPPORT' && account.supportTemporary === true) {
      const token = cleanText_(pin && typeof pin === 'object' ? (pin.token || pin.actorPin || pin.pin) : pin);
      const session = posAppSessionForToken_(token);
      if (!session || normaliseShopCode_(session.shopCode) !== normaliseShopCode_(activeShopCode_())) throw new Error('Temporary Support session is not valid for this workspace.');
      if (account.supportExpiresAt && new Date(account.supportExpiresAt).getTime() <= Date.now()) throw new Error('Temporary Support authorization has expired.');
    }
    return account;
  };

  const baseAuthorizeSupport = globalThis.authorizeSupportCustomerSessionFromMaster;
  globalThis.authorizeSupportCustomerSessionFromMaster = function (request) {
    const result = baseAuthorizeSupport(request);
    saveMasterNotification_('SUPPORT_ACCESS_GRANTED', 'OPEN', result.shopCode, request && request.supportId, 'Temporary Support access granted', { expiresAt:result.expiresAt, scope:result.scope || [], grantedBy:'MASTER' });
    return result;
  };
})();
