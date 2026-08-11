(() => {
  if (window.__solonCodeFrameHttpAuthInstalled) return;
  window.__solonCodeFrameHttpAuthInstalled = true;

  const authRequiredType = 'soloncode-http-auth-required';
  const authCredentialsType = 'soloncode-http-auth-credentials';
  const frameMessageSource = 'soloncode-frame';
  const studioMessageSource = 'soloncode-studio';
  const credentialsByOrigin = new Map();
  const reportedChallenges = new Map();
  let parentOrigin = '';

  try {
    parentOrigin = window.location.ancestorOrigins?.[0] || (document.referrer && new URL(document.referrer).origin);
  } catch (_) {}

  const isDirectChild = (source) => {
    for (let index = 0; index < window.frames.length; index += 1) {
      if (window.frames[index] === source) return true;
    }
    return false;
  };

  const broadcastToChildren = (message) => {
    for (let index = 0; index < window.frames.length; index += 1) {
      window.frames[index].postMessage(message, '*');
    }
  };

  const absoluteUrl = (value) => {
    try {
      return new URL(value || window.location.href, window.location.href).toString();
    } catch (_) {
      return window.location.href;
    }
  };

  const authorizationHeader = (username, password) => {
    const bytes = new TextEncoder().encode(`${username}:${password}`);
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return `Basic ${window.btoa(binary)}`;
  };

  const credentialsForUrl = (value) => {
    try {
      return credentialsByOrigin.get(new URL(value, window.location.href).origin);
    } catch (_) {
      return null;
    }
  };

  const reportAuthRequired = (value) => {
    if (window.top === window) return;
    const url = absoluteUrl(value);
    let challengeKey = url;
    try {
      challengeKey = new URL(url).origin;
    } catch (_) {}

    const now = Date.now();
    if (now - (reportedChallenges.get(challengeKey) || 0) < 2000) return;
    reportedChallenges.set(challengeKey, now);
    window.parent.postMessage(
      {
        type: authRequiredType,
        source: frameMessageSource,
        payload: { url },
      },
      parentOrigin || '*',
    );
  };

  const installFetchMonitoring = () => {
    if (typeof window.fetch !== 'function') return;
    const nativeFetch = window.fetch;
    window.fetch = async function (input, init) {
      const requestUrl = absoluteUrl(typeof input === 'string' || input instanceof URL ? input : input?.url);
      const credentials = credentialsForUrl(requestUrl);
      let fetchInput = input;
      let fetchInit = init;

      if (credentials) {
        const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
        if (!headers.has('Authorization')) headers.set('Authorization', credentials.authorization);
        if (input instanceof Request) fetchInput = new Request(input, { ...init, headers });
        else fetchInit = { ...init, headers };
      }

      const response = await nativeFetch.call(this, fetchInput, fetchInit);
      if (response.status === 401) reportAuthRequired(response.url || requestUrl);
      return response;
    };
  };

  const installXmlHttpRequestMonitoring = () => {
    if (typeof window.XMLHttpRequest !== 'function') return;
    const requestState = new WeakMap();
    const nativeOpen = XMLHttpRequest.prototype.open;
    const nativeSend = XMLHttpRequest.prototype.send;
    const nativeSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      requestState.set(this, { url: absoluteUrl(url), hasAuthorization: false });
      return nativeOpen.call(this, method, url, ...args);
    };
    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      const request = requestState.get(this);
      if (request && String(name).toLowerCase() === 'authorization') request.hasAuthorization = true;
      return nativeSetRequestHeader.call(this, name, value);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      const request = requestState.get(this);
      const credentials = request && credentialsForUrl(request.url);
      if (request && credentials && !request.hasAuthorization) {
        nativeSetRequestHeader.call(this, 'Authorization', credentials.authorization);
      }
      this.addEventListener(
        'loadend',
        () => {
          if (this.status === 401) reportAuthRequired(this.responseURL || request?.url);
        },
        { once: true },
      );
      return nativeSend.apply(this, args);
    };
  };

  const installResourceMonitoring = () => {
    if (typeof window.PerformanceObserver !== 'function') return;
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.responseStatus === 401) reportAuthRequired(entry.name);
        });
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch (_) {}
  };

  if (window.top !== window) {
    installFetchMonitoring();
    installXmlHttpRequestMonitoring();
    installResourceMonitoring();
  }

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (
      window.top !== window &&
      isDirectChild(event.source) &&
      data?.source === frameMessageSource &&
      data.type === authRequiredType
    ) {
      window.parent.postMessage(data, parentOrigin || '*');
      return;
    }

    if (
      event.source === window.parent &&
      (!parentOrigin || event.origin === parentOrigin) &&
      data?.source === studioMessageSource &&
      data.type === authCredentialsType
    ) {
      const origin = data.payload?.origin;
      const username = data.payload?.username;
      const password = data.payload?.password;
      if (origin && typeof username === 'string' && typeof password === 'string') {
        credentialsByOrigin.set(origin, {
          authorization: authorizationHeader(username, password),
        });
      }
      broadcastToChildren(data);
    }
  });
})();
