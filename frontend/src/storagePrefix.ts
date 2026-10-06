// Test builds only (VITE_STORAGE_PREFIX set by the deploy workflow's test
// job). The test site lives on the same address as the live site
// (…github.io/ACC-Reliability-Platform-1/test/), and browsers give one
// address one shared localStorage. Without this, the test site and the live
// site would read each other's login, saved settings (including which
// backend to talk to) and offline queue — queued test work could even be
// sent to the live backend. Prefixing every key keeps the two completely
// apart. This runs before anything else in the page, and the embedded
// module bundles load into the same page, so it covers them too.
//
// Live builds leave the prefix unset and this file does nothing.

const prefix = import.meta.env.VITE_STORAGE_PREFIX as string | undefined;

if (prefix && typeof Storage !== 'undefined') {
  const proto = Storage.prototype;
  const getItem = proto.getItem;
  const setItem = proto.setItem;
  const removeItem = proto.removeItem;
  const key = proto.key;

  proto.getItem = function (k: string) {
    return getItem.call(this, prefix + k);
  };
  proto.setItem = function (k: string, v: string) {
    setItem.call(this, prefix + k, v);
  };
  proto.removeItem = function (k: string) {
    removeItem.call(this, prefix + k);
  };
  proto.clear = function () {
    const mine: string[] = [];
    for (let i = 0; i < this.length; i++) {
      const k = key.call(this, i);
      if (k && k.startsWith(prefix)) mine.push(k);
    }
    mine.forEach((k) => removeItem.call(this, k));
  };
}

export {};
