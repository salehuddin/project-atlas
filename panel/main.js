(() => {
  // node_modules/@openchamber/sdk/dist/api-version.js
  var OPENCHAMBER_SDK_CHANNEL = "openchamber.sdk";
  var OPENCHAMBER_SDK_API_VERSION = 1;

  // node_modules/@openchamber/sdk/dist/scrollbar-style.js
  var GUEST_SCROLLING_ATTRIBUTE = "data-oc-scrolling";
  var GUEST_SCROLLBAR_CSS = `
:root {
  /* Quiet at rest like the app's own thumbs; hover gives a clear grab target. */
  --oc-scrollbar-thumb: color-mix(in srgb, var(--oc-muted, currentColor) 18%, transparent);
  --oc-scrollbar-thumb-hover: color-mix(in srgb, var(--oc-muted, currentColor) 36%, transparent);
  scrollbar-gutter: stable;
}
* {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
:hover, [${GUEST_SCROLLING_ATTRIBUTE}] {
  scrollbar-color: var(--oc-scrollbar-thumb) transparent;
}
/* Chromium's standard scrollbar properties otherwise override its pseudo-elements. */
@supports selector(::-webkit-scrollbar) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-width: auto; scrollbar-color: auto; }
  ::-webkit-scrollbar { width: 6px; height: 6px; background: transparent; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 999px;
    min-width: 24px;
    min-height: 24px;
  }
  :hover::-webkit-scrollbar-thumb, [${GUEST_SCROLLING_ATTRIBUTE}]::-webkit-scrollbar-thumb { background: var(--oc-scrollbar-thumb); }
  ::-webkit-scrollbar-thumb:hover { background: var(--oc-scrollbar-thumb-hover); }
  ::-webkit-scrollbar-corner { background: transparent; }
  ::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
}
@media (forced-colors: active) {
  *, :hover, [${GUEST_SCROLLING_ATTRIBUTE}] { scrollbar-color: auto; }
  ::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: CanvasText; }
}
`;
  function installGuestScrollbarActivity(doc) {
    const root = doc.documentElement;
    if (root.hasAttribute("data-oc-scrollbar-activity"))
      return;
    root.setAttribute("data-oc-scrollbar-activity", "");
    const timers = /* @__PURE__ */ new WeakMap();
    doc.addEventListener("scroll", (event) => {
      const target = event.target === doc ? root : event.target;
      if (!(target instanceof Element))
        return;
      if (!target.hasAttribute("data-oc-scrolling"))
        target.setAttribute("data-oc-scrolling", "");
      const pending = timers.get(target);
      if (pending !== void 0)
        clearTimeout(pending);
      timers.set(target, setTimeout(() => {
        timers.delete(target);
        target.removeAttribute("data-oc-scrolling");
      }, 1e3));
    }, { capture: true, passive: true });
  }
  var GUEST_SCROLLBAR_SCRIPT = `(${installGuestScrollbarActivity.toString()})(document);`;

  // node_modules/@openchamber/sdk/dist/workspace.js
  var GUEST_STORAGE_KEY_MAX = 128;
  var GUEST_STORAGE_VALUE_BYTES = 65536;

  // node_modules/@openchamber/sdk/dist/shells.js
  var GUEST_SHELL_ID_MAX = 128;
  var GUEST_SHELL_OUTPUT_TAIL_MAX = 65536;

  // node_modules/@openchamber/sdk/dist/microphone.js
  var GUEST_MICROPHONE_SAMPLE_RATE_MIN = 8e3;
  var GUEST_MICROPHONE_SAMPLE_RATE_MAX = 192e3;
  var GUEST_MICROPHONE_OPEN_TIMEOUT_MS = 12e4;
  var createSampleQueue = (capacity) => {
    const chunks = [];
    let offset = 0;
    let queued = 0;
    return {
      push: (samples) => {
        chunks.push(samples);
        queued += samples.length;
        while (queued - offset > capacity && chunks.length > 1) {
          const dropped = chunks.shift();
          queued -= dropped?.length ?? 0;
          offset = 0;
        }
      },
      /** Fills `out` from the queue and pads the rest with silence. */
      pull: (out) => {
        let written = 0;
        while (written < out.length && chunks.length > 0) {
          const head = chunks[0];
          const count = Math.min(out.length - written, head.length - offset);
          out.set(head.subarray(offset, offset + count), written);
          written += count;
          offset += count;
          if (offset >= head.length) {
            chunks.shift();
            queued -= head.length;
            offset = 0;
          }
        }
        out.fill(0, written);
      },
      clear: () => {
        chunks.length = 0;
        offset = 0;
        queued = 0;
      },
      get size() {
        return queued - offset;
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/status-controls.js
  var GUEST_STATUS_CONTROLS_MAX = 4;
  var GUEST_STATUS_CONTROL_ID = /^[a-z][a-z0-9-]{0,39}$/;
  var GUEST_STATUS_CONTROL_LABEL_MAX = 60;
  var GUEST_STATUS_CONTROL_OPTIONS_MAX = 16;
  var GUEST_STATUS_CONTROL_VALUE_MAX = 80;
  var isControlObject = (value) => Object(value) === value && !Array.isArray(value);
  var hasOnlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));
  var isLabel = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_LABEL_MAX;
  var isValue = (value) => String(value) === value && value.length >= 1 && value.length <= GUEST_STATUS_CONTROL_VALUE_MAX;
  var isGuestStatusControls = (controls) => {
    if (!Array.isArray(controls) || controls.length > GUEST_STATUS_CONTROLS_MAX)
      return false;
    const ids = /* @__PURE__ */ new Set();
    for (const control of controls) {
      if (!isControlObject(control) || !GUEST_STATUS_CONTROL_ID.test(control.id) || !isLabel(control.label))
        return false;
      if (control.disabled !== void 0 && control.disabled !== true && control.disabled !== false)
        return false;
      if (ids.has(control.id))
        return false;
      ids.add(control.id);
      if (control.kind === "button") {
        if (!hasOnlyKeys(control, ["kind", "id", "label", "disabled"]))
          return false;
        continue;
      }
      if (control.kind !== "select" || !hasOnlyKeys(control, ["kind", "id", "label", "value", "options", "disabled"]))
        return false;
      if (!isValue(control.value) || !Array.isArray(control.options) || control.options.length < 1 || control.options.length > GUEST_STATUS_CONTROL_OPTIONS_MAX)
        return false;
      const values = /* @__PURE__ */ new Set();
      for (const option of control.options) {
        if (!isControlObject(option) || !hasOnlyKeys(option, ["value", "label"]) || !isValue(option.value) || !isLabel(option.label) || values.has(option.value))
          return false;
        values.add(option.value);
      }
      if (!values.has(control.value))
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/manifest.js
  var GUEST_PROVIDER_LOGO_BYTES_MAX = 1024 * 1024;
  var TRACKER_URL_TOKENS = ["{id}", "{segment}", "{segments+}"];
  var TRACKER_URL_TOKEN_SET = new Set(TRACKER_URL_TOKENS);

  // node_modules/@openchamber/sdk/dist/session-events.js
  var GUEST_SESSION_EVENT_TYPES = [
    "turn-finished",
    "turn-failed",
    "permission-asked",
    "question-asked",
    "turn-started",
    "session-created",
    "session-archived",
    "session-deleted"
  ];
  var SESSION_EVENTS_IDLE_MS = 10 * 6e4;
  var EVENT_TYPES = new Set(GUEST_SESSION_EVENT_TYPES);

  // node_modules/@openchamber/sdk/dist/service-host.js
  var SERVICE_SCHEDULE_IDLE_MS = 10 * 6e4;
  var MENTIONS_IDLE_MS = 10 * 6e4;

  // node_modules/@openchamber/sdk/dist/file-editor.js
  var GUEST_FILE_EDITOR_CONTENT_MAX = 2e7;
  var GUEST_FILE_EDITOR_VERSION_MAX = 256;
  var fileEditorPayloadSize = (value) => "bytes" in value ? value.bytes.byteLength : value.content.length;
  var sameFileEditorDocument = (left, right) => {
    if (left.path !== right.path || left.readOnly !== right.readOnly)
      return false;
    if (left.encoding === "text" || right.encoding === "text") {
      return left.encoding === "text" && right.encoding === "text" && left.content === right.content;
    }
    if (left.bytes.byteLength !== right.bytes.byteLength)
      return false;
    for (let index = 0; index < left.bytes.byteLength; index += 1) {
      if (left.bytes[index] !== right.bytes[index])
        return false;
    }
    return true;
  };

  // node_modules/@openchamber/sdk/dist/popover.js
  var GUEST_POPOVER_ID = /^[A-Za-z0-9_-]{1,80}$/;
  var GUEST_POPOVER_COORDINATE_MAX = 1e5;
  var GUEST_POPOVER_WIDTH_MIN = 160;
  var GUEST_POPOVER_WIDTH_MAX = 640;
  var GUEST_POPOVER_HEIGHT_MIN = 48;
  var GUEST_POPOVER_HEIGHT_MAX = 480;
  var GUEST_POPOVER_DATA_MAX = 16e3;
  var GUEST_POPOVER_DATA_DEPTH_MAX = 32;
  var GUEST_POPOVER_SIDES = ["left", "right", "top", "bottom"];
  var hasBoundedJsonTree = (value, depth = 0, budget = { remaining: GUEST_POPOVER_DATA_MAX }) => {
    if (--budget.remaining < 0 || depth >= GUEST_POPOVER_DATA_DEPTH_MAX)
      return false;
    if (value === null)
      return true;
    const children = Array.isArray(value) ? value : Object(value) === value ? Object.values(value) : [];
    for (const item of children) {
      if (!hasBoundedJsonTree(item, depth + 1, budget))
        return false;
    }
    return true;
  };
  var isFiniteJson = (value) => {
    if (value === null || value === true || value === false)
      return true;
    if (Array.isArray(value))
      return Object.keys(value).every((key) => /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length) && value.every(isFiniteJson);
    if (Object(value) === value) {
      const prototype = Object.getPrototypeOf(value);
      return (prototype === null || prototype === Object.prototype) && Object.values(value).every(isFiniteJson);
    }
    return String(value) === value || Number.isFinite(value);
  };
  var isGuestPopoverRequest = (request) => {
    try {
      if (String(request.id) !== request.id || !GUEST_POPOVER_ID.test(request.id) || !Number.isFinite(request.anchor.x) || Math.abs(request.anchor.x) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.y) || Math.abs(request.anchor.y) > GUEST_POPOVER_COORDINATE_MAX || !Number.isFinite(request.anchor.width) || !Number.isFinite(request.anchor.height) || request.anchor.width <= 0 || request.anchor.height <= 0 || request.anchor.width > GUEST_POPOVER_COORDINATE_MAX || request.anchor.height > GUEST_POPOVER_COORDINATE_MAX || !Number.isInteger(request.width) || request.width < GUEST_POPOVER_WIDTH_MIN || request.width > GUEST_POPOVER_WIDTH_MAX || !Number.isInteger(request.height) || request.height < GUEST_POPOVER_HEIGHT_MIN || request.height > GUEST_POPOVER_HEIGHT_MAX || request.side !== void 0 && !GUEST_POPOVER_SIDES.includes(request.side) || request.focus !== void 0 && request.focus !== true && request.focus !== false || !hasBoundedJsonTree(request.data) || !isFiniteJson(request.data))
        return false;
      return JSON.stringify(request.data).length <= GUEST_POPOVER_DATA_MAX;
    } catch {
      return false;
    }
  };

  // node_modules/@openchamber/sdk/dist/contract.js
  var GUEST_BLOCK_ANSWER_MAX = 2e3;
  var GUEST_FILE_STAT_KINDS = ["file", "directory", "other", "missing"];
  var isStartSessionResult = (value) => Boolean(value && "sessionId" in value);
  var isPromptResult = (value) => Boolean(value && "sent" in value && !("sessionId" in value));
  var GUEST_COMMIT_SHA = /^[0-9a-f]{7,64}$/i;
  var isGuestCommitSha = (value) => GUEST_COMMIT_SHA.test(value);
  var GUEST_TOAST_MAX = 500;
  var GUEST_CLIPBOARD_TEXT_MAX = 32e3;
  var GUEST_COMPOSE_TEXT_MAX = 16e3;
  var GUEST_ATTACH_ID_MAX = 128;
  var GUEST_ATTACH_TITLE_MAX = 200;
  var GUEST_ATTACH_URL_MAX = 2e3;
  var GUEST_ATTACH_TEXT_MAX = 16e3;
  var GUEST_ATTACH_AUTHOR_MAX = 80;
  var GUEST_ATTACH_BRANCH_MAX = 200;
  var GUEST_ATTACH_DATA_MAX = 16e3;
  var GUEST_REQUEST_PATH_MAX = 2e3;
  var GUEST_REQUEST_TIMEOUT_MS = 2e4;
  var GUEST_FILE_PATH_MAX = 1024;
  var GUEST_FILE_CONTENT_MAX = 2e6;
  var GUEST_GENERATE_PROMPT_MAX = 64e3;
  var GUEST_GENERATE_SYSTEM_MAX = 8e3;
  var GUEST_GENERATE_OUTPUT_TOKENS_MAX = 4e3;
  var GUEST_GENERATE_TIMEOUT_MS = 96e4;
  var GUEST_GENERATE_LATE_KEEP_MS = 60 * 6e4;
  var GUEST_BADGE_MAX = 999;
  var GUEST_FRAME_HEIGHT_MAX = 1e4;
  var GUEST_RESOLVE_ERROR_MAX = 500;
  var HOST_REQUEST_ERROR_CODES = [
    "HOST_UNAVAILABLE",
    "HOST_TIMEOUT",
    "HOST_REJECTED",
    "DISCONNECTED",
    "DISABLED",
    "BAD_PATH",
    "NO_INTEGRATION",
    "NO_SERVICE",
    "SERVICE_FAILED",
    "REQUEST_FAILED",
    "RESPONSE_TOO_LARGE",
    "NO_SESSION",
    "SESSION_BUSY",
    "NOT_GRANTED",
    "NO_DIRECTORY",
    "NOT_FOUND",
    "FILE_TOO_LARGE",
    "DENIED",
    "NO_MODEL",
    "MODEL_FAILED",
    "UNSUPPORTED"
  ];
  var SERVICE_STATUS_VALUES = ["stopped", "starting", "ready", "failed"];
  var hostRequestErrorCodeSet = new Set(HOST_REQUEST_ERROR_CODES);
  var isHostRequestErrorCode = (value) => hostRequestErrorCodeSet.has(value);
  var resolveHostRequestErrorCode = (value) => value && isHostRequestErrorCode(value) ? value : "HOST_REJECTED";
  var isJsonValue = (value) => {
    if (value === void 0)
      return false;
    if (value === null || value === true || value === false)
      return true;
    if (String(value) === value)
      return true;
    if (Number(value) === value)
      return Number.isFinite(value);
    if (Array.isArray(value))
      return value.every(isJsonValue);
    if (Object(value) === value)
      return Object.values(value).every(isJsonValue);
    return false;
  };
  var isAttachData = (value) => isJsonValue(value) && JSON.stringify(value).length <= GUEST_ATTACH_DATA_MAX;
  var clampBranch = (value) => value?.trim().slice(0, GUEST_ATTACH_BRANCH_MAX) ?? "";
  var clampAttachRequest = (request) => {
    const id = request.id.trim().slice(0, GUEST_ATTACH_ID_MAX);
    const title = request.title.trim().slice(0, GUEST_ATTACH_TITLE_MAX);
    const url = request.url.trim().slice(0, GUEST_ATTACH_URL_MAX);
    const text = request.text?.trim().slice(0, GUEST_ATTACH_TEXT_MAX);
    const author = request.author?.trim().slice(0, GUEST_ATTACH_AUTHOR_MAX);
    const kind = request.kind === "pull" ? "pull" : "issue";
    const next = {
      providerId: request.providerId.trim(),
      id,
      title: title || id,
      url,
      kind
    };
    if (text) {
      next.text = text;
    }
    if (author) {
      next.author = author;
    }
    if (kind === "pull") {
      const head = clampBranch(request.branches?.head);
      const base = clampBranch(request.branches?.base);
      if (head && base) {
        next.branches = { head, base };
      }
    }
    if (isAttachData(request.data)) {
      next.data = request.data;
    }
    return next;
  };
  var clampStartSessionRequest = (request) => {
    const next = clampAttachRequest(request);
    if (request.projectId)
      next.projectId = request.projectId;
    if (request.navigation)
      next.navigation = request.navigation;
    if (request.worktree) {
      next.worktree = request.worktree;
    }
    return next;
  };
  var clampPromptRequest = (request) => {
    const next = {
      text: request.text.trim().slice(0, GUEST_COMPOSE_TEXT_MAX)
    };
    if (request.send) {
      next.send = true;
    }
    return next;
  };
  var clampBadgeCount = (count) => {
    if (count === null || !Number.isFinite(count))
      return null;
    return Math.min(GUEST_BADGE_MAX, Math.max(0, Math.round(count)));
  };
  var clampFrameHeight = (height) => {
    if (!Number.isFinite(height))
      return 0;
    return Math.min(GUEST_FRAME_HEIGHT_MAX, Math.max(0, Math.ceil(height)));
  };
  var isGuestFilePath = (value) => value.length > 0 && value.length <= GUEST_FILE_PATH_MAX && !value.includes("\0") && !value.includes("\\");
  var isGuestRequestPath = (value) => {
    if (!value.startsWith("/") || value.includes("\0") || value.includes("\\") || value.includes("://")) {
      return false;
    }
    if (value.length > GUEST_REQUEST_PATH_MAX) {
      return false;
    }
    const segments = value.split("/");
    return !segments.some((segment) => segment === "." || segment === "..");
  };
  var serviceStatusSet = new Set(SERVICE_STATUS_VALUES);
  var isServiceStatusResult = (value) => Boolean(value && "status" in value && serviceStatusSet.has(String(value.status)) && !("body" in value));
  var isGuestRequestResult = (value) => Boolean(value && "status" in value && "body" in value && Number.isInteger(value.status));
  var isFileReadResult = (value) => Boolean(value && "content" in value && String(value.content) === value.content);
  var isFileWriteResult = (value) => Boolean(value && "written" in value && value.written === true);
  var isFileListResult = (value) => Boolean(value && "entries" in value && Array.isArray(value.entries));
  var fileStatKindSet = new Set(GUEST_FILE_STAT_KINDS);
  var isFileStatResult = (value) => Boolean(value && "kind" in value && "size" in value && fileStatKindSet.has(String(value.kind)) && Number.isFinite(value.size));
  var isGenerateResult = (value) => Boolean(value && "text" in value && String(value.text) === value.text && !("status" in value));
  var HOST_PUSH_TYPES = /* @__PURE__ */ new Set([
    "workspace",
    "shells",
    "ready",
    "directory",
    "session",
    "connection",
    "settings",
    "session-lifecycle",
    "item",
    "resolve",
    "action",
    "service-event",
    "status-control-event",
    "popover-closed",
    "file-open",
    "file-snapshot",
    "file-saved",
    "generate-late",
    "microphone-audio",
    "microphone-ended"
  ]);
  var asWireRecord = (data) => Object(data) === data ? data : null;
  var isNonEmptyString = (value) => String(value) === value && value.length > 0;
  var readResultMessage = (wire) => {
    if (!isNonEmptyString(wire.id))
      return null;
    if (wire.ok === true) {
      const message = {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: true
      };
      if (Object(wire.payload) === wire.payload) {
        message.payload = wire.payload;
      }
      return message;
    }
    if (wire.ok === false && isNonEmptyString(wire.error)) {
      return {
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "result",
        id: wire.id,
        ok: false,
        error: wire.error,
        code: resolveHostRequestErrorCode(isNonEmptyString(wire.code) ? wire.code : void 0)
      };
    }
    return null;
  };
  var readHostMessage = (data) => {
    const wire = asWireRecord(data);
    if (!wire || wire.channel !== OPENCHAMBER_SDK_CHANNEL || wire.v !== OPENCHAMBER_SDK_API_VERSION)
      return null;
    if (wire.type === "result")
      return readResultMessage(wire);
    if (!HOST_PUSH_TYPES.has(String(wire.type)) || Object(wire.payload) !== wire.payload)
      return null;
    return wire;
  };

  // node_modules/@openchamber/sdk/dist/host.js
  var isKeyEvent = (event) => "key" in event && "metaKey" in event && "ctrlKey" in event;
  var isSaveShortcut = (event) => (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s";
  var HostRequestError = class extends Error {
    code;
    constructor(code, message) {
      super(message);
      this.name = "HostRequestError";
      this.code = code;
    }
  };
  var rejectBadPath = () => Promise.reject(new HostRequestError("BAD_PATH", 'Request path must start with "/" and stay on the declared origin.'));
  var rejectBadFilePath = () => Promise.reject(new HostRequestError("BAD_PATH", `File path must be 1 to ${GUEST_FILE_PATH_MAX} characters without NUL or backslash.`));
  var deviceStorageScope = (options) => {
    if (options === void 0)
      return void 0;
    if (Object(options) !== options || Array.isArray(options) || options.scope !== void 0 && options.scope !== "instance" && options.scope !== "device") {
      throw new HostRequestError("HOST_REJECTED", 'Storage scope must be "instance" or "device".');
    }
    return options.scope === "device" ? "device" : void 0;
  };
  var nextId = (n) => {
    n.value += 1;
    return `oc-${n.value}`;
  };
  var connectHost = (options = {}) => {
    const target = options.target ?? ("window" in globalThis ? window : null);
    if (!target) {
      throw new HostRequestError("HOST_UNAVAILABLE", "No window. connectHost runs in a browser frame.");
    }
    const acceptSource = options.acceptSource ?? ((source) => source === target.parent);
    const requestTimeoutMs = options.requestTimeoutMs ?? GUEST_REQUEST_TIMEOUT_MS;
    const readyListeners = /* @__PURE__ */ new Set();
    const directoryListeners = /* @__PURE__ */ new Set();
    const sessionListeners = /* @__PURE__ */ new Set();
    const lifecycleListeners = /* @__PURE__ */ new Set();
    const connectionListeners = /* @__PURE__ */ new Set();
    const settingsListeners = /* @__PURE__ */ new Set();
    const itemListeners = /* @__PURE__ */ new Set();
    const blockListeners = /* @__PURE__ */ new Set();
    const serviceEventListeners = /* @__PURE__ */ new Set();
    const statusControlListeners = /* @__PURE__ */ new Set();
    const popoverClosedListeners = /* @__PURE__ */ new Set();
    const lateGenerateListeners = /* @__PURE__ */ new Set();
    const unclaimedLateGenerate = [];
    let resolveHandler = null;
    let actionHandler = null;
    const fileOpenListeners = /* @__PURE__ */ new Set();
    const fileSavedListeners = /* @__PURE__ */ new Set();
    let fileSnapshotHandler = null;
    let lastFile = null;
    let saveShortcutInstalled = false;
    const pending = /* @__PURE__ */ new Map();
    const workspaceListeners = /* @__PURE__ */ new Map();
    const shellsListeners = /* @__PURE__ */ new Map();
    let disposed = false;
    const ids = { value: 0 };
    let lastReady = null;
    let lastLifecycle = null;
    let popoverPointerActive = false;
    let popoverFocusActive = false;
    let popoverActivityReported = null;
    let microphone = null;
    const lifecycleFromSession = (session) => {
      if (!session)
        return null;
      return {
        sessionId: session.id,
        phase: session.busy ? "started" : "completed"
      };
    };
    const post = (message) => {
      target.parent.postMessage(message, "*");
    };
    const listenForLateGenerate = () => {
      if (disposed || target.parent === target || lateGenerateListeners.size === 0 || lastReady?.features?.lateGenerateResults !== true)
        return;
      post({ channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: "generate-late-listen" });
    };
    const emit = (listeners, value) => {
      for (const listener of listeners) {
        try {
          listener(value);
        } catch (error) {
          console.error(error);
        }
      }
    };
    const onMessage = (event) => {
      if (!(event instanceof MessageEvent))
        return;
      if (!acceptSource(event.source))
        return;
      const message = readHostMessage(event.data);
      if (!message)
        return;
      if (message.type === "workspace") {
        const listener = workspaceListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "shells") {
        const listener = shellsListeners.get(message.payload.subscriptionId);
        if (listener)
          emit([listener], message.payload.snapshot);
        return;
      }
      if (message.type === "microphone-audio") {
        microphone?.queue.push(message.payload.samples);
        return;
      }
      if (message.type === "microphone-ended") {
        const open = microphone;
        if (!open)
          return;
        microphone = null;
        open.release();
        emit(open.endedListeners, message.payload.reason);
        return;
      }
      if (message.type === "ready") {
        lastReady = message.payload;
        lastLifecycle = lifecycleFromSession(message.payload.session);
        emit(readyListeners, message.payload);
        emit(directoryListeners, message.payload.directory);
        emit(sessionListeners, message.payload.session);
        if (lastLifecycle) {
          emit(lifecycleListeners, lastLifecycle);
        }
        emit(connectionListeners, message.payload.connection);
        emit(settingsListeners, message.payload.settings);
        emit(itemListeners, message.payload.item);
        if (message.payload.block)
          emit(blockListeners, message.payload.block);
        listenForLateGenerate();
        return;
      }
      if (message.type === "service-event") {
        emit(serviceEventListeners, message.payload);
        return;
      }
      if (message.type === "generate-late") {
        if (lateGenerateListeners.size === 0)
          unclaimedLateGenerate.push(message.payload);
        else
          emit(lateGenerateListeners, message.payload);
        return;
      }
      if (message.type === "directory") {
        if (lastReady) {
          lastReady = { ...lastReady, directory: message.payload.directory };
        }
        emit(directoryListeners, message.payload.directory);
        return;
      }
      if (message.type === "session") {
        if (lastReady) {
          lastReady = { ...lastReady, session: message.payload.session };
        }
        if (!message.payload.session) {
          lastLifecycle = null;
        } else if (lastLifecycle?.sessionId !== message.payload.session.id) {
          lastLifecycle = lifecycleFromSession(message.payload.session);
        }
        emit(sessionListeners, message.payload.session);
        return;
      }
      if (message.type === "session-lifecycle") {
        lastLifecycle = message.payload;
        emit(lifecycleListeners, message.payload);
        return;
      }
      if (message.type === "connection") {
        if (lastReady) {
          lastReady = { ...lastReady, connection: message.payload.connection };
        }
        emit(connectionListeners, message.payload.connection);
        return;
      }
      if (message.type === "settings") {
        if (lastReady) {
          lastReady = { ...lastReady, settings: message.payload.settings };
        }
        emit(settingsListeners, message.payload.settings);
        return;
      }
      if (message.type === "item") {
        if (lastReady) {
          lastReady = { ...lastReady, item: message.payload.item };
        }
        emit(itemListeners, message.payload.item);
        return;
      }
      if (message.type === "status-control-event") {
        emit(statusControlListeners, message.payload);
        return;
      }
      if (message.type === "popover-closed") {
        emit(popoverClosedListeners, message.payload);
        return;
      }
      if (message.type === "action") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "action-result",
              id: message.id,
              payload
            });
        };
        const handler = actionHandler;
        if (!handler) {
          answer({ ok: false, error: "This extension does not handle background actions." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then(() => answer({ ok: true }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ ok: false, error: (text || "Action failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      if (message.type === "file-open") {
        const next = message.payload;
        if (lastFile && sameFileEditorDocument(lastFile, next))
          return;
        lastFile = next;
        emit(fileOpenListeners, message.payload);
        return;
      }
      if (message.type === "file-saved") {
        emit(fileSavedListeners, message.payload.version);
        return;
      }
      if (message.type === "file-snapshot") {
        const answer = (payload) => {
          if (!disposed)
            post({
              channel: OPENCHAMBER_SDK_CHANNEL,
              v: OPENCHAMBER_SDK_API_VERSION,
              type: "file-snapshot-result",
              id: message.id,
              payload
            });
        };
        const fail = (text) => answer({ error: (text.trim() || "Could not read the edited file.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        const handler = fileSnapshotHandler;
        if (!handler) {
          fail("This extension does not edit files.");
          return;
        }
        Promise.resolve().then(() => handler(message.payload.purpose)).then((snapshot) => {
          if (fileEditorPayloadSize(snapshot) > GUEST_FILE_EDITOR_CONTENT_MAX) {
            fail(`The file is over ${GUEST_FILE_EDITOR_CONTENT_MAX} ${"bytes" in snapshot ? "bytes" : "characters"}.`);
            return;
          }
          if (snapshot.version.length > GUEST_FILE_EDITOR_VERSION_MAX) {
            fail(`The snapshot version is over ${GUEST_FILE_EDITOR_VERSION_MAX} characters.`);
            return;
          }
          answer({ snapshot: "bytes" in snapshot ? { bytes: snapshot.bytes, version: snapshot.version } : { content: snapshot.content, version: snapshot.version } });
        }, (error) => fail(error instanceof Error ? error.message : String(error)));
        return;
      }
      if (message.type === "resolve") {
        const answer = (payload) => {
          post({
            channel: OPENCHAMBER_SDK_CHANNEL,
            v: OPENCHAMBER_SDK_API_VERSION,
            type: "resolve-result",
            id: message.id,
            payload
          });
        };
        const handler = resolveHandler;
        if (!handler) {
          answer({ error: "This extension does not resolve commands." });
          return;
        }
        Promise.resolve().then(() => handler(message.payload)).then((item) => answer({ item: item ? clampAttachRequest(item) : null }), (error) => {
          const text = (error instanceof Error ? error.message : String(error)).trim();
          answer({ error: (text || "Command failed.").slice(0, GUEST_RESOLVE_ERROR_MAX) });
        });
        return;
      }
      const waiter = pending.get(message.id);
      if (!waiter)
        return;
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      if (message.ok) {
        waiter.resolve(message.payload);
        return;
      }
      waiter.reject(new HostRequestError(message.code, message.error));
    };
    target.addEventListener("message", onMessage);
    post({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: "hello"
    });
    const send = (message, timeoutMs = requestTimeoutMs) => {
      if (disposed || target.parent === target) {
        return Promise.reject(new HostRequestError("HOST_UNAVAILABLE", "No host frame. This page is not in an iframe."));
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(message.id);
          reject(new HostRequestError("HOST_TIMEOUT", "Host did not answer in time."));
        }, timeoutMs);
        pending.set(message.id, { resolve, reject, timer });
        post(message);
      });
    };
    const request = (message) => send(message).then(() => void 0);
    const envelope = { channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION };
    const notify = (message) => {
      if (!disposed && target.parent !== target)
        post(message);
    };
    const requestFileSave = () => notify({ ...envelope, type: "file-save" });
    const postMicrophoneClose = () => {
      if (!disposed && target.parent !== target)
        post({ ...envelope, type: "microphone-close", id: nextId(ids) });
    };
    const openMicrophone = async () => {
      if (microphone)
        throw new HostRequestError("HOST_REJECTED", "The microphone is already open in this frame.");
      if (lastReady?.features?.microphone !== true) {
        throw new HostRequestError("UNSUPPORTED", "This OpenChamber cannot share the microphone with extensions.");
      }
      const AudioContextCtor = globalThis.AudioContext;
      if (typeof AudioContextCtor !== "function")
        throw new HostRequestError("UNSUPPORTED", "This frame has no Web Audio.");
      const context = new AudioContextCtor();
      if (context.sampleRate < GUEST_MICROPHONE_SAMPLE_RATE_MIN || context.sampleRate > GUEST_MICROPHONE_SAMPLE_RATE_MAX) {
        void context.close().catch(() => void 0);
        throw new HostRequestError("UNSUPPORTED", `Audio at ${context.sampleRate} Hz is not supported.`);
      }
      const resumed = context.state === "suspended" ? context.resume().catch(() => void 0) : void 0;
      const queue = createSampleQueue(Math.round(context.sampleRate / 4));
      const processor = context.createScriptProcessor(1024, 1, 1);
      processor.onaudioprocess = (event) => queue.pull(event.outputBuffer.getChannelData(0));
      const destination = context.createMediaStreamDestination();
      processor.connect(destination);
      const endedListeners = /* @__PURE__ */ new Set();
      const open = {
        queue,
        endedListeners,
        release: () => {
          processor.onaudioprocess = null;
          processor.disconnect();
          queue.clear();
          for (const track of destination.stream.getTracks())
            track.stop();
          void context.close().catch(() => void 0);
        }
      };
      microphone = open;
      try {
        const result = await send(
          { ...envelope, type: "microphone-open", id: nextId(ids), payload: { sampleRate: context.sampleRate } },
          // The host may be waiting on the system's permission prompt.
          GUEST_MICROPHONE_OPEN_TIMEOUT_MS
        );
        if (!result || !("opened" in result) || result.opened !== true) {
          throw new HostRequestError("HOST_REJECTED", "Host did not open the microphone.");
        }
        await resumed;
        if (microphone !== open)
          throw new HostRequestError("DISCONNECTED", "The microphone closed while it was opening.");
      } catch (error) {
        if (microphone === open)
          microphone = null;
        open.release();
        postMicrophoneClose();
        throw error;
      }
      return {
        stream: destination.stream,
        close: () => {
          if (microphone !== open)
            return;
          microphone = null;
          open.release();
          postMicrophoneClose();
        },
        onEnded: (listener) => {
          endedListeners.add(listener);
          return () => {
            endedListeners.delete(listener);
          };
        }
      };
    };
    const onSaveShortcut = (event) => {
      if (!isKeyEvent(event) || !isSaveShortcut(event))
        return;
      event.preventDefault();
      requestFileSave();
    };
    const onPopoverEscape = (event) => {
      if (!isKeyEvent(event) || event.key !== "Escape" || lastReady?.surface !== "popover" || !lastReady.popover)
        return;
      event.preventDefault();
      void closePopover(lastReady.popover.id, "escape").catch(() => void 0);
    };
    const reportPopoverActivity = () => {
      const popover = lastReady?.surface === "popover" ? lastReady.popover : void 0;
      if (!popover)
        return;
      const active2 = popoverPointerActive || popoverFocusActive;
      if (popoverActivityReported === active2)
        return;
      popoverActivityReported = active2;
      void setPopoverAnchorActive(popover.id, active2).catch(() => void 0);
    };
    const onPopoverPointerOver = () => {
      if (lastReady?.surface !== "popover" || popoverPointerActive)
        return;
      popoverPointerActive = true;
      reportPopoverActivity();
    };
    const onPopoverPointerOut = (event) => {
      if (lastReady?.surface !== "popover" || event.relatedTarget !== null || !popoverPointerActive)
        return;
      popoverPointerActive = false;
      reportPopoverActivity();
    };
    const onPopoverFocus = () => {
      if (lastReady?.surface !== "popover" || popoverFocusActive)
        return;
      popoverFocusActive = true;
      reportPopoverActivity();
    };
    const onPopoverBlur = () => {
      if (lastReady?.surface !== "popover" || !popoverFocusActive)
        return;
      popoverFocusActive = false;
      reportPopoverActivity();
    };
    const requireIdentity = (value, maximum = 1024) => {
      if (!value.trim() || value.length > maximum)
        throw new HostRequestError("HOST_REJECTED", `Identity must contain 1 to ${maximum} characters.`);
    };
    const readWorkspace = async (query) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const result = await send({ ...envelope, type: "workspace-read", id: nextId(ids), payload: query });
      if (!result || !("kind" in result) || !("state" in result) || result.kind !== query.kind) {
        throw new HostRequestError("HOST_REJECTED", "Host did not return workspace data.");
      }
      return result;
    };
    const subscribeWorkspace = async (query, listener) => {
      if (query.kind !== "projects")
        requireIdentity(query.projectId);
      const subscriptionId = nextId(ids);
      workspaceListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "workspace-subscribe", id: nextId(ids), payload: { subscriptionId, query } });
      } catch (error) {
        workspaceListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!workspaceListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const subscribeShells = async (scope, listener) => {
      if (scope.kind === "session")
        requireIdentity(scope.sessionId);
      if (scope.kind === "project")
        requireIdentity(scope.projectId);
      const subscriptionId = nextId(ids);
      shellsListeners.set(subscriptionId, listener);
      try {
        await request({ ...envelope, type: "shells-subscribe", id: nextId(ids), payload: { subscriptionId, scope } });
      } catch (error) {
        shellsListeners.delete(subscriptionId);
        if (!disposed)
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        throw error;
      }
      return () => {
        if (!shellsListeners.delete(subscriptionId) || disposed)
          return;
        post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
      };
    };
    const storage = async (payload) => {
      if ("key" in payload && (payload.key.length === 0 || payload.key.length > GUEST_STORAGE_KEY_MAX)) {
        throw new HostRequestError("HOST_REJECTED", "Storage key must contain 1 to 128 characters.");
      }
      if (payload.op === "set" && !isJsonValue(payload.value)) {
        throw new HostRequestError("HOST_REJECTED", "Storage values must be JSON.");
      }
      if (payload.op === "set" && new TextEncoder().encode(JSON.stringify(payload.value)).length > GUEST_STORAGE_VALUE_BYTES) {
        throw new HostRequestError("HOST_REJECTED", "Storage value exceeds 64 KiB.");
      }
      if (payload.scope === "device" && lastReady?.features?.deviceStorage !== true) {
        throw new HostRequestError("UNSUPPORTED", "This host does not support device storage.");
      }
      const result = await send({ ...envelope, type: "storage", id: nextId(ids), payload });
      if (!result || !("storage" in result) || result.op !== payload.op)
        throw new HostRequestError("HOST_REJECTED", "Host did not return storage data.");
      return result;
    };
    const closePopover = (id, reason) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-close", id: nextId(ids), payload: reason ? { id, reason } : { id } });
    const setPopoverAnchorActive = (id, active2) => lastReady?.features?.popovers !== true && !(lastReady?.surface === "popover" && lastReady.popover?.id === id) ? Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers.")) : request({ ...envelope, type: "popover-anchor", id: nextId(ids), payload: { id, active: active2 } });
    target.addEventListener("keydown", onPopoverEscape, true);
    target.addEventListener("pointerover", onPopoverPointerOver);
    target.addEventListener("pointermove", onPopoverPointerOver);
    target.addEventListener("pointerout", onPopoverPointerOut);
    target.addEventListener("focus", onPopoverFocus);
    target.addEventListener("blur", onPopoverBlur);
    return {
      onAction: (handler) => {
        actionHandler = handler;
        return () => {
          if (actionHandler === handler)
            actionHandler = null;
        };
      },
      listProjects: async () => {
        const result = await readWorkspace({ kind: "projects" });
        if (result.kind !== "projects")
          throw new HostRequestError("HOST_REJECTED", "Expected projects.");
        return result;
      },
      listWorktrees: async (projectId) => {
        const result = await readWorkspace({ kind: "worktrees", projectId });
        if (result.kind !== "worktrees")
          throw new HostRequestError("HOST_REJECTED", "Expected worktrees.");
        return result;
      },
      listSessions: async (projectId) => {
        const result = await readWorkspace({ kind: "sessions", projectId });
        if (result.kind !== "sessions")
          throw new HostRequestError("HOST_REJECTED", "Expected sessions.");
        return result;
      },
      onProjects: (listener) => subscribeWorkspace({ kind: "projects" }, (snapshot) => {
        if (snapshot.kind === "projects")
          listener(snapshot);
      }),
      onWorktrees: (projectId, listener) => subscribeWorkspace({ kind: "worktrees", projectId }, (snapshot) => {
        if (snapshot.kind === "worktrees")
          listener(snapshot);
      }),
      onSessions: (projectId, listener) => subscribeWorkspace({ kind: "sessions", projectId }, (snapshot) => {
        if (snapshot.kind === "sessions")
          listener(snapshot);
      }),
      onRunningShells: (scope, listener) => subscribeShells(scope, listener),
      readShellOutput: async (shellId, options2) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const cursor = options2?.cursor;
        if (cursor !== void 0 && (!Number.isInteger(cursor) || cursor < 0)) {
          throw new HostRequestError("HOST_REJECTED", "Shell output cursor must be a non-negative integer.");
        }
        const tailBytes = options2?.tailBytes;
        if (tailBytes !== void 0 && (!Number.isInteger(tailBytes) || tailBytes < 1 || tailBytes > GUEST_SHELL_OUTPUT_TAIL_MAX)) {
          throw new HostRequestError("HOST_REJECTED", `Shell output tailBytes must be an integer between 1 and ${GUEST_SHELL_OUTPUT_TAIL_MAX}.`);
        }
        const result = await send({ ...envelope, type: "shell-output", id: nextId(ids), payload: { shellId, cursor, tailBytes } });
        const output = result;
        if (!output || typeof output.output !== "string" || !Number.isFinite(output.cursor)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return shell output.");
        }
        return output;
      },
      stopShell: async (shellId) => {
        requireIdentity(shellId, GUEST_SHELL_ID_MAX);
        const result = await send({ ...envelope, type: "shell-stop", id: nextId(ids), payload: { shellId } });
        if (result?.stopped !== true)
          throw new HostRequestError("HOST_REJECTED", "Host did not stop the shell.");
        return { stopped: true };
      },
      openSession: async (sessionId) => {
        requireIdentity(sessionId);
        await request({ ...envelope, type: "open-session", id: nextId(ids), payload: { sessionId } });
      },
      storage: {
        get: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "get", key };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          return result.op === "get" && result.found ? result.value : void 0;
        },
        set: async (key, value, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "set", key, value };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        delete: async (key, options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "delete", key };
          if (scope)
            payload.scope = scope;
          await storage(payload);
        },
        keys: async (options2) => {
          const scope = deviceStorageScope(options2);
          const payload = { op: "keys" };
          if (scope)
            payload.scope = scope;
          const result = await storage(payload);
          if (result.op !== "keys")
            throw new HostRequestError("HOST_REJECTED", "Expected storage keys.");
          return result.keys;
        }
      },
      onReady: (listener) => {
        readyListeners.add(listener);
        if (lastReady)
          listener(lastReady);
        return () => {
          readyListeners.delete(listener);
        };
      },
      onDirectory: (listener) => {
        directoryListeners.add(listener);
        if (lastReady)
          listener(lastReady.directory);
        return () => {
          directoryListeners.delete(listener);
        };
      },
      onSession: (listener) => {
        sessionListeners.add(listener);
        if (lastReady)
          listener(lastReady.session);
        return () => {
          sessionListeners.delete(listener);
        };
      },
      onSessionLifecycle: (listener) => {
        lifecycleListeners.add(listener);
        if (lastLifecycle)
          listener(lastLifecycle);
        return () => {
          lifecycleListeners.delete(listener);
        };
      },
      onConnection: (listener) => {
        connectionListeners.add(listener);
        if (lastReady)
          listener(lastReady.connection);
        return () => {
          connectionListeners.delete(listener);
        };
      },
      onSettings: (listener) => {
        settingsListeners.add(listener);
        if (lastReady)
          listener(lastReady.settings);
        return () => {
          settingsListeners.delete(listener);
        };
      },
      onItem: (listener) => {
        itemListeners.add(listener);
        if (lastReady)
          listener(lastReady.item);
        return () => {
          itemListeners.delete(listener);
        };
      },
      onBlock: (listener) => {
        blockListeners.add(listener);
        if (lastReady?.block)
          listener(lastReady.block);
        return () => {
          blockListeners.delete(listener);
        };
      },
      onServiceEvent: (listener) => {
        serviceEventListeners.add(listener);
        return () => {
          serviceEventListeners.delete(listener);
        };
      },
      onStatusControl: (listener) => {
        statusControlListeners.add(listener);
        return () => {
          statusControlListeners.delete(listener);
        };
      },
      onPopoverClosed: (listener) => {
        popoverClosedListeners.add(listener);
        return () => {
          popoverClosedListeners.delete(listener);
        };
      },
      setStatusControls: (controls) => {
        if (lastReady?.features?.statusControls !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support status controls."));
        }
        if (!isGuestStatusControls(controls)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Status controls must have unique bounded ids and valid selected options."));
        }
        return request({ ...envelope, type: "status-controls", id: nextId(ids), payload: { controls } });
      },
      openPopover: (payload) => {
        if (lastReady?.features?.popovers !== true) {
          return Promise.reject(new HostRequestError("UNSUPPORTED", "This host does not support popovers."));
        }
        if (!isGuestPopoverRequest(payload)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "Popover requests need bounded geometry and JSON data."));
        }
        return request({ ...envelope, type: "popover-open", id: nextId(ids), payload });
      },
      closePopover,
      setPopoverAnchorActive,
      onResolve: (handler) => {
        resolveHandler = handler;
        return () => {
          if (resolveHandler === handler)
            resolveHandler = null;
        };
      },
      toast: (payload) => {
        const message = payload.message.trim();
        if (!message || message.length > GUEST_TOAST_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast message must contain 1 to ${GUEST_TOAST_MAX} characters.`));
        }
        if (payload.copy && payload.copy !== true && (!payload.copy.text.length || payload.copy.text.length > GUEST_CLIPBOARD_TEXT_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Toast copy text must contain 1 to ${GUEST_CLIPBOARD_TEXT_MAX} characters.`));
        }
        return request({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "toast",
          id: nextId(ids),
          payload: { ...payload, message }
        });
      },
      openUrl: (url) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-url",
        id: nextId(ids),
        payload: { url }
      }),
      openCommit: (sha) => isGuestCommitSha(sha) ? request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-commit",
        id: nextId(ids),
        payload: { sha }
      }) : Promise.reject(new HostRequestError("HOST_REJECTED", "Commit id must be 7 to 64 hex characters.")),
      answerBlock: (text) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "block-answer",
        id: nextId(ids),
        payload: { text: text.trim().slice(0, GUEST_BLOCK_ANSWER_MAX) }
      }),
      openSurface: (surfaceId) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "open-surface",
        id: nextId(ids),
        payload: { surfaceId }
      }),
      writeClipboard: (text) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "clipboard-write",
        id: nextId(ids),
        payload: { text }
      }),
      compose: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "compose",
        id: nextId(ids),
        payload
      }),
      attach: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "attach",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      startSession: async (payload) => {
        if (payload.projectId !== void 0)
          requireIdentity(payload.projectId);
        const worktree = payload.worktree;
        if (worktree && worktree !== true) {
          if (worktree.kind === "existing")
            requireIdentity(worktree.directory);
          else {
            if (worktree.name !== void 0)
              requireIdentity(worktree.name, 200);
            if (worktree.baseBranch !== void 0)
              requireIdentity(worktree.baseBranch, 200);
          }
        }
        const result = await send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "start-session",
          id: nextId(ids),
          payload: clampStartSessionRequest(payload)
        }, options.requestTimeoutMs ?? 18e4);
        if (!isStartSessionResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a session.");
        }
        return result;
      },
      prompt: (payload) => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "prompt",
        id: nextId(ids),
        payload: clampPromptRequest(payload)
      }).then((result) => {
        if (!isPromptResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return a prompt result.");
        }
        return result;
      }),
      sessionLink: (payload) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "session-link",
        id: nextId(ids),
        payload: clampAttachRequest(payload)
      }),
      close: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "close",
        id: nextId(ids)
      }),
      oauthStart: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-start",
        id: nextId(ids)
      }),
      oauthDisconnect: () => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "oauth-disconnect",
        id: nextId(ids)
      }),
      request: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host request result was empty.");
        }
        return result;
      }),
      serviceRequest: (payload) => (isGuestRequestPath(payload.path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-request",
        id: nextId(ids),
        payload
      }) : rejectBadPath()).then((result) => {
        if (!isGuestRequestResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host service request result was empty.");
        }
        return result;
      }),
      serviceStatus: () => send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "service-status",
        id: nextId(ids)
      }).then((result) => {
        if (!isServiceStatusResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return service status.");
        }
        return result;
      }),
      readFile: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-read",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileReadResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file content.");
        }
        return result;
      }),
      writeFile: (path, content) => {
        if (!isGuestFilePath(path)) {
          return rejectBadFilePath();
        }
        if (content.length > GUEST_FILE_CONTENT_MAX) {
          return Promise.reject(new HostRequestError("FILE_TOO_LARGE", `Content is over ${GUEST_FILE_CONTENT_MAX} characters.`));
        }
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "file-write",
          id: nextId(ids),
          payload: { path, content }
        }).then((result) => {
          if (!isFileWriteResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not confirm the write.");
          }
          return result;
        });
      },
      listDir: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-list",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileListResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return directory entries.");
        }
        return result;
      }),
      stat: (path) => (isGuestFilePath(path) ? send({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "file-stat",
        id: nextId(ids),
        payload: { path }
      }) : rejectBadFilePath()).then((result) => {
        if (!isFileStatResult(result)) {
          throw new HostRequestError("HOST_REJECTED", "Host did not return file status.");
        }
        return result;
      }),
      generate: (input) => {
        const prompt = input.prompt.trim();
        const system = input.system?.trim();
        if (prompt.length === 0 || prompt.length > GUEST_GENERATE_PROMPT_MAX) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `Prompt must be 1 to ${GUEST_GENERATE_PROMPT_MAX} characters.`));
        }
        if (system !== void 0 && (system.length === 0 || system.length > GUEST_GENERATE_SYSTEM_MAX)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", `System prompt must be 1 to ${GUEST_GENERATE_SYSTEM_MAX} characters.`));
        }
        const maxOutputTokens = input.maxOutputTokens === void 0 ? void 0 : Math.min(GUEST_GENERATE_OUTPUT_TOKENS_MAX, Math.max(1, Math.floor(input.maxOutputTokens)));
        if (maxOutputTokens !== void 0 && !Number.isFinite(maxOutputTokens)) {
          return Promise.reject(new HostRequestError("HOST_REJECTED", "maxOutputTokens must be a number."));
        }
        const payload = { prompt };
        if (system !== void 0)
          payload.system = system;
        if (maxOutputTokens !== void 0)
          payload.maxOutputTokens = maxOutputTokens;
        return send({
          channel: OPENCHAMBER_SDK_CHANNEL,
          v: OPENCHAMBER_SDK_API_VERSION,
          type: "generate",
          id: nextId(ids),
          payload
        }, options.requestTimeoutMs ?? GUEST_GENERATE_TIMEOUT_MS).then((result) => {
          if (!isGenerateResult(result)) {
            throw new HostRequestError("HOST_REJECTED", "Host did not return generated text.");
          }
          return result;
        });
      },
      onLateGenerateResult: (listener) => {
        lateGenerateListeners.add(listener);
        for (const result of unclaimedLateGenerate.splice(0))
          emit([listener], result);
        listenForLateGenerate();
        return () => {
          lateGenerateListeners.delete(listener);
        };
      },
      openMicrophone,
      setBadge: (count) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "badge",
        id: nextId(ids),
        payload: { count: clampBadgeCount(count) }
      }),
      setHeight: (height) => request({
        channel: OPENCHAMBER_SDK_CHANNEL,
        v: OPENCHAMBER_SDK_API_VERSION,
        type: "resize",
        id: nextId(ids),
        payload: { height: clampFrameHeight(height) }
      }),
      onFileOpen: (listener) => {
        fileOpenListeners.add(listener);
        if (!saveShortcutInstalled) {
          saveShortcutInstalled = true;
          target.addEventListener("keydown", onSaveShortcut, true);
        }
        if (lastFile)
          listener(lastFile);
        return () => {
          fileOpenListeners.delete(listener);
        };
      },
      onFileSnapshot: (handler) => {
        fileSnapshotHandler = handler;
        return () => {
          if (fileSnapshotHandler === handler)
            fileSnapshotHandler = null;
        };
      },
      onFileSaved: (listener) => {
        fileSavedListeners.add(listener);
        return () => {
          fileSavedListeners.delete(listener);
        };
      },
      reportFileChange: (change) => notify({ ...envelope, type: "file-change", payload: { dirty: change.dirty, edited: change.edited } }),
      requestFileSave,
      reportFileUnsupported: () => notify({ ...envelope, type: "file-unsupported" }),
      dispose: () => {
        for (const subscriptionId of workspaceListeners.keys()) {
          post({ ...envelope, type: "workspace-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        workspaceListeners.clear();
        for (const subscriptionId of shellsListeners.keys()) {
          post({ ...envelope, type: "shells-unsubscribe", id: nextId(ids), payload: { subscriptionId } });
        }
        shellsListeners.clear();
        if (microphone) {
          postMicrophoneClose();
          microphone.release();
          microphone = null;
        }
        disposed = true;
        resolveHandler = null;
        actionHandler = null;
        fileSnapshotHandler = null;
        fileOpenListeners.clear();
        fileSavedListeners.clear();
        if (saveShortcutInstalled)
          target.removeEventListener("keydown", onSaveShortcut, true);
        target.removeEventListener("message", onMessage);
        target.removeEventListener("keydown", onPopoverEscape, true);
        target.removeEventListener("pointerover", onPopoverPointerOver);
        target.removeEventListener("pointermove", onPopoverPointerOver);
        target.removeEventListener("pointerout", onPopoverPointerOut);
        target.removeEventListener("focus", onPopoverFocus);
        target.removeEventListener("blur", onPopoverBlur);
        for (const waiter of pending.values()) {
          clearTimeout(waiter.timer);
          waiter.reject(new HostRequestError("HOST_UNAVAILABLE", "Host client was disposed."));
        }
        pending.clear();
        readyListeners.clear();
        directoryListeners.clear();
        sessionListeners.clear();
        lifecycleListeners.clear();
        connectionListeners.clear();
        settingsListeners.clear();
        itemListeners.clear();
        blockListeners.clear();
        serviceEventListeners.clear();
        statusControlListeners.clear();
        popoverClosedListeners.clear();
        lateGenerateListeners.clear();
        unclaimedLateGenerate.length = 0;
      }
    };
  };

  // node_modules/@openchamber/sdk/dist/service-providers.js
  var BROWSER_CONTROL_ACTIONS = [
    "browser.open",
    "browser.snapshot",
    "browser.click",
    "browser.type",
    "browser.select",
    "browser.scroll",
    "browser.back",
    "browser.forward",
    "browser.inspect",
    "browser.capture",
    "browser.resize",
    "browser.close"
  ];
  var BROWSER_PROVIDER_IDLE_MS = 10 * 6e4;
  var CONTROL_ACTIONS = new Set(BROWSER_CONTROL_ACTIONS);
  var SOURCE_CONTROL_PROVIDER_IDLE_MS = 10 * 6e4;
  var NOTIFICATIONS_PROVIDER_IDLE_MS = 10 * 6e4;
  var TRACKER_PROVIDER_IDLE_MS = 10 * 6e4;
  var QUOTA_PROVIDER_IDLE_MS = 10 * 6e4;

  // node_modules/@openchamber/sdk/dist/service-surface.js
  var SURFACE_CONTROLLERS = ["none", "agent", "user"];
  var CONTROLLERS = new Set(SURFACE_CONTROLLERS);

  // node_modules/@openchamber/sdk/dist/ui/theme.js
  var TOKEN_VARS = [
    ["--oc-bg", "background"],
    ["--oc-elevated", "elevated"],
    ["--oc-fg", "foreground"],
    ["--oc-muted", "muted"],
    ["--oc-subtle", "subtle"],
    ["--oc-border", "border"],
    ["--oc-hover", "hover"],
    ["--oc-selection", "selection"],
    ["--oc-focus", "focus"],
    ["--oc-primary", "primary"],
    ["--oc-muted-surface", "mutedSurface"],
    ["--oc-elevated-fg", "elevatedForeground"],
    ["--oc-active", "active"],
    ["--oc-selection-fg", "selectionForeground"],
    ["--oc-primary-fg", "primaryForeground"],
    ["--oc-primary-text", "primaryText"],
    ["--oc-success-text", "successText"],
    ["--oc-warning-text", "warningText"],
    ["--oc-error-text", "errorText"],
    ["--oc-info-text", "infoText"],
    ["--oc-success", "success"],
    ["--oc-warning", "warning"],
    ["--oc-error", "error"],
    ["--oc-info", "info"],
    ["--oc-font", "font"],
    ["--oc-mono", "mono"],
    ["--oc-radius", "radius"],
    ["--surface-background", "background"],
    ["--surface-elevated", "elevated"],
    ["--surface-foreground", "foreground"],
    ["--surface-muted-foreground", "muted"],
    ["--surface-subtle", "subtle"],
    ["--interactive-border", "border"],
    ["--interactive-hover", "hover"],
    ["--interactive-selection", "selection"],
    ["--interactive-focus-ring", "focus"],
    ["--primary", "primary"],
    ["--surface-muted", "mutedSurface"],
    ["--surface-elevated-foreground", "elevatedForeground"],
    ["--interactive-active", "active"],
    ["--interactive-selection-foreground", "selectionForeground"],
    ["--primary-foreground", "primaryForeground"],
    ["--primary-text", "primaryText"],
    ["--success-text", "successText"],
    ["--warning-text", "warningText"],
    ["--error-text", "errorText"],
    ["--info-text", "infoText"],
    ["--status-success", "success"],
    ["--status-warning", "warning"],
    ["--status-error", "error"],
    ["--status-info", "info"],
    ["--font-sans", "font"],
    ["--font-mono", "mono"],
    ["--radius", "radius"]
  ];
  var SYNTAX_TOKEN_VARS = [
    ["--oc-syntax-keyword", "--syntax-keyword", "syntaxKeyword"],
    ["--oc-syntax-string", "--syntax-string", "syntaxString"],
    ["--oc-syntax-number", "--syntax-number", "syntaxNumber"],
    ["--oc-syntax-function", "--syntax-function", "syntaxFunction"],
    ["--oc-syntax-type", "--syntax-type", "syntaxType"],
    ["--oc-syntax-comment", "--syntax-comment", "syntaxComment"],
    ["--oc-syntax-variable", "--syntax-variable", "syntaxVariable"],
    ["--oc-syntax-operator", "--syntax-operator", "syntaxOperator"]
  ];
  var applyHostTheme = (theme, root) => {
    root.style.colorScheme = theme.mode;
    for (const [name, key] of TOKEN_VARS) {
      root.style.setProperty(name, theme.tokens[key]);
    }
    for (const [alias, hostName, key] of SYNTAX_TOKEN_VARS) {
      const value = theme.tokens[key] ?? "";
      root.style.setProperty(alias, value);
      root.style.setProperty(hostName, value);
    }
    root.style.setProperty("font-family", theme.tokens.font);
    root.style.setProperty("font-size", theme.tokens.fontSize ?? "0.875rem");
    root.style.setProperty("line-height", "1.45");
    root.style.setProperty("color", theme.tokens.foreground);
  };
  var applyHostReady = (ctx, root) => {
    applyHostTheme(ctx.theme, root);
    if (root.dataset) {
      root.dataset.ocSurface = ctx.surface;
      root.dataset.ocTheme = ctx.theme.mode;
    }
  };

  // node_modules/@openchamber/sdk/dist/ui/style.js
  var OC_ALIAS = {
    "surface-background": "bg",
    "surface-elevated": "elevated",
    "surface-elevated-foreground": "elevated-fg",
    "surface-foreground": "fg",
    "surface-muted-foreground": "muted",
    "surface-muted": "muted-surface",
    "surface-subtle": "subtle",
    "interactive-border": "border",
    "interactive-hover": "hover",
    "interactive-active": "active",
    "interactive-selection": "selection",
    "interactive-selection-foreground": "selection-fg",
    "interactive-focus-ring": "focus",
    "primary": "primary",
    "primary-foreground": "primary-fg",
    "primary-text": "primary-text",
    "success-text": "success-text",
    "warning-text": "warning-text",
    "error-text": "error-text",
    "info-text": "info-text",
    "status-success": "success",
    "status-warning": "warning",
    "status-error": "error",
    "status-info": "info",
    "font-sans": "font",
    "font-mono": "mono",
    "radius": "radius"
  };
  var v = (name, fallback) => `var(--${name}, var(--oc-${OC_ALIAS[name]}, ${fallback}))`;
  var bg = v("surface-background", "transparent");
  var elevated = v("surface-elevated", "transparent");
  var elevatedFg = v("surface-elevated-foreground", "inherit");
  var fg = v("surface-foreground", "inherit");
  var muted = v("surface-muted-foreground", "gray");
  var secondary = v("surface-muted", "transparent");
  var border = v("interactive-border", "currentColor");
  var hover = v("interactive-hover", "transparent");
  var active = v("interactive-active", "transparent");
  var selection = v("interactive-selection", "transparent");
  var selectionFg = v("interactive-selection-foreground", "inherit");
  var primary = v("primary", "currentColor");
  var primaryText = v("primary-text", "inherit");
  var errorText = v("error-text", "inherit");
  var font = v("font-sans", "inherit");
  var mono = v("font-mono", "monospace");
  var radius = v("radius", "9px");
  var controlRadius = `calc(${radius} - 2px)`;
  var smallRadius = `calc(${radius} - 4px)`;
  var mix = (color, pct, base = "transparent") => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
  var focusFill = `background-image: linear-gradient(${hover}, ${hover});`;
  var field = (edge, width = "0.5px") => `box-shadow: inset 0 0 0 ${width} ${edge}, var(--oc-sdk-field-lift);`;
  var raised = "border-color: var(--oc-sdk-edge); box-shadow: var(--oc-sdk-raised-lift);";
  var litButton = "box-shadow: var(--oc-sdk-lit);";
  var darkLift = `inset 0 0.5px 0 0 ${mix(fg, 8)}, 0 1px 2px 0 rgb(0 0 0 / 0.4)`;
  var THEME_VARS = `
:root {
  --oc-sdk-edge: ${mix(fg, 16)};
  --oc-sdk-field-bg: ${elevated};
  --oc-sdk-raised-bg: ${bg};
  --oc-sdk-field-lift: inset 0 1px 2px 0 rgb(0 0 0 / 0.04);
  --oc-sdk-raised-lift: 0 1px 1.5px 0 rgb(0 0 0 / 0.08);
  --oc-sdk-lit: inset 0 1px 0 0 rgb(255 255 255 / 0.2), 0 1px 1.5px 0 rgb(0 0 0 / 0.1);
  --oc-sdk-float-edge: rgb(0 0 0 / 0.14);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.7), 0 1px 2px -0.5px rgb(0 0 0 / 0.06), 0 4px 8px -2px rgb(0 0 0 / 0.08), 0 12px 20px -4px rgb(0 0 0 / 0.06);
}
:root[data-oc-theme="dark"] {
  --oc-sdk-edge: ${mix(fg, 14)};
  --oc-sdk-field-bg: ${mix(bg, 50, elevated)};
  --oc-sdk-raised-bg: ${elevated};
  --oc-sdk-field-lift: ${darkLift};
  --oc-sdk-raised-lift: ${darkLift};
  --oc-sdk-lit: ${darkLift};
  --oc-sdk-float-edge: rgb(0 0 0 / 0.55);
  --oc-sdk-float: inset 0 1px 0 0 rgb(255 255 255 / 0.04), inset 0 0 0 0.5px rgb(255 255 255 / 0.08), 0 8px 16px 0 rgb(0 0 0 / 0.25), 0 4px 8px 0 rgb(0 0 0 / 0.25);
}`;
  var tone = (name) => {
    const color = v(`status-${name}`, "currentColor");
    return `
.oc-sdk[data-tone="${name}"], .oc-sdk [data-tone="${name}"] { --oc-sdk-tone: ${color}; --oc-sdk-tone-text: ${v(`${name}-text`, "inherit")}; }`;
  };
  var len = (px) => `calc(${px}rem / 14)`;
  var UI_SIZE_CSS = `
.oc-sdk { box-sizing: border-box; font-size: 0.875rem; line-height: 1.45; }
.oc-sdk *, .oc-sdk *::before, .oc-sdk *::after { box-sizing: border-box; }
/* :where() keeps the reset at zero specificity so every primitive class below overrides it. */
:where(.oc-sdk) :where(button, input, textarea), :where(button.oc-sdk, input.oc-sdk, textarea.oc-sdk) { font: inherit; color: inherit; margin: 0; }
:where(.oc-sdk) :where(button), :where(button.oc-sdk) { cursor: pointer; background: none; border: 0; padding: 0; }
.oc-sdk button:disabled, button.oc-sdk:disabled, .oc-sdk[aria-disabled="true"], .oc-sdk [aria-disabled="true"] { opacity: .5; pointer-events: none; }

.oc-sdk-btn { display: inline-flex; align-items: center; justify-content: center; gap: ${len(8)}; height: ${len(32)}; padding: 0 ${len(12)}; border: 1px solid transparent; font-size: 0.875rem; font-weight: 500; line-height: 1; white-space: nowrap; }
.oc-sdk-btn[data-size="sm"] { gap: ${len(6)}; height: ${len(28)}; padding: 0 ${len(10)}; font-size: 0.8125rem; }
.oc-sdk-btn[data-size="xs"] { gap: ${len(4)}; height: ${len(24)}; padding: 0 ${len(8)}; font-size: 0.75rem; }
.oc-sdk-btn[data-loading="true"] { opacity: .5; pointer-events: none; }
.oc-sdk-btn > .oc-sdk-spinner-ring { width: ${len(14)}; height: ${len(14)}; }

.oc-sdk-field { display: flex; flex-direction: column; gap: ${len(4)}; min-width: 0; }
.oc-sdk-field-label { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-field-note { font-size: 0.75rem; }
.oc-sdk-input { display: block; width: 100%; min-width: 0; height: ${len(32)}; padding: 0 ${len(10)}; border: 0; font-size: 0.875rem; line-height: 1.45; appearance: none; }
textarea.oc-sdk-input { height: auto; padding: ${len(8)} ${len(10)}; resize: vertical; }

.oc-sdk-search { position: relative; min-width: 0; }
.oc-sdk-search .oc-sdk-input { padding-left: ${len(34)}; padding-right: ${len(34)}; }
.oc-sdk-search-icon { position: absolute; left: ${len(11)}; top: 50%; transform: translateY(-50%); pointer-events: none; }
.oc-sdk-search-clear { position: absolute; right: ${len(6)}; top: 50%; transform: translateY(-50%); display: none; align-items: center; justify-content: center; width: ${len(24)}; height: ${len(24)}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-clear { display: inline-flex; }

.oc-sdk-select { position: relative; display: flex; flex-direction: column; gap: ${len(4)}; min-width: 0; }
.oc-sdk-trigger { display: inline-flex; align-items: center; gap: ${len(6)}; align-self: flex-start; width: auto; max-width: 100%; min-width: 0; height: ${len(28)}; padding: 0 ${len(10)}; border: 1px solid transparent; font-size: 0.8125rem; text-align: left; }
.oc-sdk-trigger-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-trigger-chevron { flex: 0 0 auto; }
.oc-sdk-popup { position: fixed; z-index: 50; display: flex; flex-direction: column; gap: ${len(2)}; min-width: ${len(160)}; max-width: calc(100vw - ${len(16)}); max-height: min(${len(320)}, calc(100vh - ${len(16)})); overflow: auto; padding: ${len(4)}; border: 1px solid transparent; }
.oc-sdk-popup-search { flex: 0 0 auto; padding: ${len(2)} ${len(2)} ${len(4)}; }
.oc-sdk-popup-search .oc-sdk-input { height: ${len(28)}; font-size: 0.8125rem; }
.oc-sdk-option { display: flex; align-items: center; gap: ${len(8)}; width: 100%; padding: ${len(6)} ${len(8)}; font-size: 0.8125rem; text-align: left; }
.oc-sdk-option-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-option-hint { flex: 0 0 auto; font-size: 0.75rem; }
.oc-sdk-option-check { flex: 0 0 auto; display: inline-flex; width: ${len(14)}; visibility: hidden; }
.oc-sdk-option[aria-selected="true"] > .oc-sdk-option-check { visibility: visible; }
.oc-sdk-popup-empty { padding: ${len(8)}; font-size: 0.8125rem; }

.oc-sdk-check { display: inline-flex; align-items: flex-start; gap: ${len(8)}; width: 100%; text-align: left; }
.oc-sdk-check-box { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: ${len(14)}; height: ${len(14)}; margin-top: ${len(3)}; border: 1px solid transparent; }
.oc-sdk-check-box > svg { display: none; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box > svg { display: block; }
.oc-sdk-check-thumb { flex: 0 0 auto; position: relative; width: ${len(36)}; height: ${len(20)}; --oc-sdk-thumb-travel: ${len(16)}; }
.oc-sdk-check-thumb::after { content: ""; position: absolute; top: ${len(2)}; left: ${len(2)}; width: ${len(16)}; height: ${len(16)}; }
.oc-sdk-check-text { display: flex; flex-direction: column; min-width: 0; }
.oc-sdk-check-label { font-size: 0.875rem; }
.oc-sdk-check-desc { font-size: 0.75rem; }

.oc-sdk-tabs { display: inline-flex; gap: ${len(2)}; padding: ${len(2)}; max-width: 100%; overflow: auto; }
.oc-sdk-tab { display: inline-flex; align-items: center; gap: ${len(6)}; height: ${len(28)}; padding: 0 ${len(10)}; border: 1px solid transparent; font-size: 0.8125rem; font-weight: 500; white-space: nowrap; }
.oc-sdk-tab-count { font-size: 0.75rem; font-variant-numeric: tabular-nums; }

.oc-sdk-badge { display: inline-flex; align-items: center; padding: ${len(1)} ${len(6)}; font-size: ${len(11)}; font-weight: 500; line-height: ${len(16)}; white-space: nowrap; }

.oc-sdk-list { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.oc-sdk-row { display: flex; align-items: center; gap: ${len(8)}; width: 100%; padding: ${len(6)} ${len(8)}; text-align: left; }
.oc-sdk-row-lead { flex: 0 0 auto; width: ${len(64)}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.oc-sdk-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.oc-sdk-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; }
.oc-sdk-row-meta { flex: 0 0 auto; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-list-empty { padding: ${len(16)} ${len(8)}; text-align: center; font-size: 0.8125rem; }

.oc-sdk-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: ${len(4)}; padding: ${len(40)} ${len(16)}; text-align: center; }
.oc-sdk-empty-title { margin: 0; font-size: 0.8125rem; font-weight: 600; }
.oc-sdk-empty-body { margin: 0; max-width: 32rem; font-size: 0.8125rem; }
.oc-sdk-empty-action { margin-top: ${len(12)}; }

@keyframes oc-sdk-spin { to { transform: rotate(360deg); } }
.oc-sdk-spinner { display: inline-flex; align-items: center; gap: ${len(8)}; font-size: 0.8125rem; }
.oc-sdk-spinner-ring { width: ${len(16)}; height: ${len(16)}; border: 2px solid transparent; animation: oc-sdk-spin .8s linear infinite; }
.oc-sdk-spinner[data-size="sm"] .oc-sdk-spinner-ring { width: ${len(12)}; height: ${len(12)}; }

.oc-sdk-banner { display: flex; align-items: flex-start; gap: ${len(12)}; padding: ${len(8)} ${len(12)}; border: 1px solid transparent; }
.oc-sdk-banner-text { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: ${len(2)}; }
.oc-sdk-banner-title { font-size: 0.8125rem; font-weight: 500; }
.oc-sdk-banner-body { font-size: 0.8125rem; }
.oc-sdk-banner-action { flex: 0 0 auto; }

.oc-sdk-separator { display: flex; align-items: center; gap: ${len(8)}; width: 100%; margin: ${len(8)} 0; font-size: 0.75rem; }
.oc-sdk-separator::before, .oc-sdk-separator::after { content: ""; flex: 1 1 auto; height: 1px; }
.oc-sdk-separator[data-labeled="false"]::after { display: none; }
.oc-sdk-popup > .oc-sdk-separator { margin: ${len(4)} 0; }

.oc-sdk-progress { display: flex; flex-direction: column; gap: ${len(4)}; min-width: 0; }
.oc-sdk-progress-label { display: flex; justify-content: space-between; font-size: 0.75rem; font-variant-numeric: tabular-nums; }
.oc-sdk-progress-track { height: ${len(6)}; overflow: hidden; }
.oc-sdk-progress-fill { height: 100%; transform-origin: left; transition: transform 200ms ease-out; }
.oc-sdk-progress-value { display: inline-flex; align-items: center; gap: ${len(2)}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { font-weight: 600; }

.oc-sdk-menu { position: relative; display: inline-flex; }

.oc-sdk-text { white-space: pre-wrap; overflow-wrap: anywhere; }
.oc-sdk-text img { display: block; max-width: 100%; margin: ${len(8)} 0; }

/* Under a finger the controls reach the app's touch sizes: rows and options 44px like its sheets, every other
   control at least 36px. Inputs keep 16px text, below which iOS zooms the page on focus. */
@media (pointer: coarse) {
  .oc-sdk-btn, .oc-sdk-input { height: ${len(40)}; }
  .oc-sdk-btn[data-size="sm"], .oc-sdk-btn[data-size="xs"], .oc-sdk-trigger, .oc-sdk-tab, .oc-sdk-popup-search .oc-sdk-input { height: ${len(36)}; }
  .oc-sdk-input, .oc-sdk-popup-search .oc-sdk-input { font-size: max(16px, 0.875rem); }
  .oc-sdk-search-clear { width: ${len(36)}; height: ${len(36)}; right: 0; }
  .oc-sdk-row, .oc-sdk-option { min-height: ${len(44)}; }
  .oc-sdk-check { min-height: ${len(36)}; padding: ${len(8)} 0; }
}
`;
  var GUEST_UI_LOOK_CSS = `${THEME_VARS}
.oc-sdk { color: ${fg}; font-family: ${font}; }
.oc-sdk :focus-visible, .oc-sdk:focus-visible { outline: none; }
.oc-sdk :where(button, a[href], [role="button"], [role="tab"], [role="option"]):focus-visible, button.oc-sdk:focus-visible { ${focusFill} }
.oc-sdk-mono { font-family: ${mono}; }
.oc-sdk-muted { color: ${muted}; }
${tone("success")}${tone("warning")}${tone("error")}${tone("info")}
.oc-sdk[data-tone="primary"], .oc-sdk [data-tone="primary"] { --oc-sdk-tone: ${primary}; --oc-sdk-tone-text: ${primaryText}; }

.oc-sdk-btn { border-radius: ${controlRadius}; transition: background 150ms ease-out, color 150ms ease-out; }
.oc-sdk-btn[data-size="xs"] { border-radius: ${smallRadius}; }
.oc-sdk-btn[data-variant="default"] { color: ${primaryText}; background: ${mix(primary, 10, bg)}; border-color: ${mix(primary, 12)}; ${litButton} }
.oc-sdk-btn[data-variant="default"]:hover { background: ${mix(primary, 16, bg)}; }
.oc-sdk-btn[data-variant="default"]:active { background: ${mix(primary, 22, bg)}; box-shadow: none; }
.oc-sdk-btn[data-variant="secondary"] { background: ${secondary}; color: var(--oc-fg); }
.oc-sdk-btn[data-variant="secondary"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="secondary"]:active { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-btn[data-variant="outline"] { background: var(--oc-sdk-raised-bg); color: ${elevatedFg}; ${raised} }
.oc-sdk-btn[data-variant="outline"]:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-btn[data-variant="outline"]:active { background-image: linear-gradient(${active}, ${active}); box-shadow: none; }
.oc-sdk-btn[data-variant="ghost"] { background: transparent; }
.oc-sdk-btn[data-variant="ghost"]:hover { background: ${hover}; }
.oc-sdk-btn[data-variant="ghost"]:active { background: ${active}; }
.oc-sdk-btn[data-variant="destructive"] { --oc-sdk-tone: ${v("status-error", "red")}; color: ${errorText}; background: ${mix("var(--oc-sdk-tone)", 7, bg)}; border-color: ${mix("var(--oc-sdk-tone)", 12)}; ${litButton} }
.oc-sdk-btn[data-variant="destructive"]:hover { background: ${mix("var(--oc-sdk-tone)", 9, bg)}; }
.oc-sdk-btn[data-variant="destructive"]:active { background: ${mix("var(--oc-sdk-tone)", 11, bg)}; box-shadow: none; }

.oc-sdk-field-note { color: ${muted}; }
.oc-sdk-field[data-invalid="true"] .oc-sdk-field-note { color: ${errorText}; }
.oc-sdk-input { border-radius: ${controlRadius}; background: var(--oc-sdk-field-bg); color: ${elevatedFg}; ${field("var(--oc-sdk-edge)")} transition: background 150ms ease-out; }
.oc-sdk-input::placeholder { color: ${muted}; }
.oc-sdk-input:hover:not(:focus) { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-input:focus, .oc-sdk-input:focus-visible { ${field(mix(fg, 26), "1px")} }
.oc-sdk-field[data-invalid="true"] .oc-sdk-input, .oc-sdk-field[data-invalid="true"] .oc-sdk-input:focus { ${field(v("status-error", "red"), "1px")} }
.oc-sdk-input[data-mono="true"] { font-family: ${mono}; }

.oc-sdk-search-icon { color: ${muted}; }
.oc-sdk-search[data-active="true"] .oc-sdk-search-icon { color: ${primary}; }
.oc-sdk-search-clear { border-radius: ${smallRadius}; color: ${muted}; }
.oc-sdk-search-clear:hover { background: ${hover}; color: ${fg}; }

.oc-sdk-trigger { border-radius: ${controlRadius}; background: var(--oc-sdk-raised-bg); color: ${elevatedFg}; ${raised} transition: background 150ms ease-out; }
.oc-sdk-trigger:hover { background-image: linear-gradient(${hover}, ${hover}); }
.oc-sdk-trigger[aria-expanded="true"] { background-image: linear-gradient(${active}, ${active}); }
.oc-sdk-trigger-value[data-empty="true"] { color: ${muted}; }
.oc-sdk-trigger-chevron { color: ${muted}; }
/* The app's floating level: the glass edge (a hairline ring and a lit top line, dark outside and light inside in dark themes) over soft shadows. The outer ring is the border, over the page like the app's. */
.oc-sdk-popup { --surface-foreground: ${elevatedFg}; border-color: var(--oc-sdk-float-edge); border-radius: 12px; background: ${elevated}; background-clip: padding-box; color: ${elevatedFg}; box-shadow: var(--oc-sdk-float); }
.oc-sdk-option { border-radius: 8px; }
.oc-sdk-option[data-active="true"] { background: ${hover}; }
/* A selected option shows a check mark in the text colour, like the app's own pickers. Options without the mark come
   from bundles built before it existed and keep the selection fill as their only sign of the choice. */
.oc-sdk-option[aria-selected="true"]:not([data-mark]) { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-option-check { color: ${fg}; }
.oc-sdk-option[data-destructive="true"] { color: ${errorText}; }
.oc-sdk-option[data-destructive="true"][data-active="true"] { background: ${mix(v("status-error", "red"), 10)}; }
.oc-sdk-option-hint { color: ${muted}; }
.oc-sdk-popup-empty { color: ${muted}; }

/* Checked stays neutral: the mark carries the state, and the primary colour stays with primary actions. */
.oc-sdk-check-box { border-color: ${border}; border-radius: 4px; color: ${fg}; transition: border-color 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-box { border-color: ${mix(fg, 60, border)}; }
.oc-sdk-check-thumb { border-radius: 9999px; background: ${border}; transition: background 150ms ease-out; }
.oc-sdk-check-thumb::after { border-radius: 9999px; background: ${bg}; transition: transform 150ms ease-out; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb { background: ${primary}; }
.oc-sdk-check[aria-checked="true"] .oc-sdk-check-thumb::after { transform: translateX(var(--oc-sdk-thumb-travel, 16px)); }
.oc-sdk-check:focus-visible { box-shadow: none; }
.oc-sdk-check:focus-visible .oc-sdk-check-box, .oc-sdk-check:focus-visible .oc-sdk-check-thumb { ${focusFill} }
.oc-sdk-check-desc { color: ${muted}; }

.oc-sdk-tabs { border-radius: 10px; }
.oc-sdk-tabs[data-track="true"] { background: ${mix(fg, 4)}; box-shadow: inset 0 1px 2px 0 rgb(0 0 0 / 0.16); }
.oc-sdk-tab { border-radius: 8px; color: ${muted}; transition: color 150ms ease-out, background 150ms ease-out; }
.oc-sdk-tab:hover { color: ${fg}; }
.oc-sdk-tab[aria-selected="true"] { color: ${selectionFg}; background: ${selection}; border-color: ${border}; }
.oc-sdk-tabs[data-track="true"] .oc-sdk-tab[aria-selected="true"] { color: ${elevatedFg}; background: var(--oc-sdk-raised-bg); ${raised} }
.oc-sdk-tab-count { color: ${muted}; }

/* The app's neutral badge: a step of the text colour, the same in every theme. */
.oc-sdk-badge { border-radius: 9999px; background: ${mix(fg, 6)}; color: ${muted}; }
.oc-sdk-badge[data-tone] { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); background: ${mix("var(--oc-sdk-tone)", 15)}; }

.oc-sdk-row { border-radius: 6px; transition: background 120ms ease-out; }
.oc-sdk-row:hover, .oc-sdk-row[data-active="true"] { background: ${hover}; }
.oc-sdk-row[aria-selected="true"] { background: ${selection}; color: ${selectionFg}; }
.oc-sdk-row-lead { font-family: ${mono}; color: ${muted}; }
.oc-sdk-row-sub { color: ${muted}; }
.oc-sdk-row-meta { color: ${muted}; }
.oc-sdk-row[aria-selected="true"] .oc-sdk-row-lead, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-sub, .oc-sdk-row[aria-selected="true"] .oc-sdk-row-meta { color: inherit; opacity: .75; }
.oc-sdk-list-empty { color: ${muted}; }

.oc-sdk-empty-body { color: ${muted}; }

.oc-sdk-spinner { color: ${muted}; }
.oc-sdk-spinner-ring { border-color: ${border}; border-top-color: ${primary}; border-radius: 9999px; }

/* Set apart by its tint alone, like the app's banners. */
.oc-sdk-banner { border-color: transparent; border-radius: 8px; background: ${mix("var(--oc-sdk-tone)", 10)}; }
.oc-sdk-banner-title { color: var(--oc-sdk-tone-text, var(--oc-sdk-tone)); }
.oc-sdk-banner-body { color: ${muted}; }

.oc-sdk-separator { color: ${muted}; }
.oc-sdk-separator::before, .oc-sdk-separator::after { background: ${mix(border, 40)}; }

.oc-sdk-progress-label { color: ${muted}; }
/* The app's progress: a groove a step of the text colour, green once done. Older bundles mark done only through aria-valuenow. */
.oc-sdk-progress-track { border-radius: 9999px; background: ${mix(fg, 6)}; }
.oc-sdk-progress-fill { border-radius: 9999px; background: var(--oc-sdk-tone, ${primary}); }
.oc-sdk-progress-track[aria-valuenow="100"] > .oc-sdk-progress-fill:not([data-tone]) { background: ${v("status-success", "currentColor")}; }
.oc-sdk-progress[data-done="true"] .oc-sdk-progress-value { color: ${v("success-text", "inherit")}; }

.oc-sdk-text a { color: ${primaryText}; text-decoration: underline; text-underline-offset: 2px; }
.oc-sdk-text img { border-radius: 8px; border: 1px solid ${mix(border, 60)}; }
`;
  var UI_CSS = `
${GUEST_SCROLLBAR_CSS}
${UI_SIZE_CSS}
${GUEST_UI_LOOK_CSS}`;

  // src/panel/main.ts
  var SUMMARY_PREFIX = "atlas:v1:summary:";
  var SITE_PREFIX = "atlas:v1:site:";
  var META_PREFIX = "atlas:v1:meta:";
  var PROBE_PREFIX = "atlas:v1:probes:";
  var SETTINGS_KEY = "atlas:v1:settings";
  var SYSTEM_PROMPT = "You write project blurbs. Two sentences, at most 45 words. Say what the project is, its main stack, and how it ships. Plain text only: no markdown, no quotes, no preamble.";
  var host = connectHost();
  var state = {
    cards: [],
    query: "",
    sort: "attention",
    ai: true,
    groupOn: true,
    collapsed: {},
    showHidden: false,
    density: "normal",
    tab: "board",
    directory: null,
    surface: "panel",
    serviceDown: false,
    sizeTimer: 0,
    sizePolls: 0,
    view: "board",
    viewId: null,
    range: 30,
    activity: null,
    activityState: "idle",
    activityFor: null,
    git: null,
    gitState: "idle",
    gitFor: null,
    spend: null,
    spendState: "idle",
    spendFor: null,
    disk: null,
    diskState: "idle",
    diskFor: null,
    probes: /* @__PURE__ */ new Map(),
    inbox: null,
    inboxState: "idle",
    inboxKind: "all",
    inboxProject: "all",
    inboxSort: "old",
    inboxGroup: false,
    inboxLimit: 150,
    spendBoard: /* @__PURE__ */ new Map(),
    spendBoardState: "idle",
    spendBoardProgress: { done: 0, total: 0 }
  };
  var summaryCache = /* @__PURE__ */ new Map();
  var siteCache = /* @__PURE__ */ new Map();
  var metaCache = /* @__PURE__ */ new Map();
  var iconIndex = /* @__PURE__ */ new Map();
  var summaryQueue = [];
  var summaryRunning = false;
  var countEl = document.querySelector("#count");
  var searchEl = document.querySelector("#search");
  var sortEl = document.querySelector("#sort");
  var aiEl = document.querySelector("#ai");
  var refreshEl = document.querySelector("#refresh");
  var groupEl = document.querySelector("#group");
  var hiddenEl = document.querySelector("#hidden-toggle");
  var inboxBadgeEl = document.querySelector("#inbox-badge");
  var tabEls = [...document.querySelectorAll(".view-tab")];
  var densityEls = [...document.querySelectorAll(".density-btn")];
  var noticeEl = document.querySelector("#notice");
  var gridEl = document.querySelector("#grid");
  var footerEl = document.querySelector("#footer");
  function div(cls) {
    const node = document.createElement("div");
    node.className = cls;
    return node;
  }
  function span(cls, text) {
    const node = document.createElement("span");
    node.className = cls;
    node.textContent = text;
    return node;
  }
  function chip(text, cls = "") {
    return span(`chip ${cls}`.trim(), text);
  }
  function render() {
    const visible = state.cards.filter((card) => !card.meta.hidden);
    countEl.textContent = String(visible.length);
    const hiddenCount = state.cards.length - visible.length;
    hiddenEl.hidden = hiddenCount === 0 && !state.showHidden;
    hiddenEl.textContent = state.showHidden ? `Hide hidden (${hiddenCount})` : `Hidden (${hiddenCount})`;
    hiddenEl.setAttribute("aria-pressed", String(state.showHidden));
    groupEl.textContent = `Group: ${state.groupOn ? "On" : "Off"}`;
    groupEl.setAttribute("aria-pressed", String(state.groupOn));
    for (const tab of tabEls) {
      const active2 = tab.dataset.tab === state.tab;
      tab.setAttribute("aria-selected", String(active2));
    }
    for (const button2 of densityEls) {
      button2.setAttribute("aria-pressed", String(button2.dataset.density === state.density));
    }
    updateInboxBadge();
    if (state.view === "project") {
      const card = state.cards.find((item) => item.project.id === state.viewId);
      gridEl.dataset.mode = "detail";
      gridEl.removeAttribute("data-density");
      gridEl.replaceChildren(card ? renderDetail(card) : mutedLine("That project is no longer open."));
    } else if (state.tab === "inbox") {
      gridEl.dataset.mode = "board";
      gridEl.removeAttribute("data-density");
      gridEl.replaceChildren(...renderInboxView());
    } else if (state.tab === "spend") {
      gridEl.dataset.mode = "board";
      gridEl.removeAttribute("data-density");
      gridEl.replaceChildren(...renderSpendBoardView());
    } else {
      gridEl.dataset.mode = "board";
      gridEl.dataset.density = state.density;
      gridEl.replaceChildren(...renderBoard());
      if (state.cards.length === 0) {
        const empty = div("empty");
        const title = document.createElement("b");
        title.textContent = "No projects yet";
        empty.append(title, document.createTextNode("Open a folder in OpenChamber and it appears here."));
        gridEl.append(empty);
      }
    }
    footerEl.textContent = footerText();
  }
  function updateInboxBadge() {
    const items = state.inbox?.items ?? [];
    const shown = state.showHidden ? items : items.filter((item) => !findCard(item.projectId)?.meta.hidden);
    if (!items.length) {
      inboxBadgeEl.hidden = true;
      inboxBadgeEl.textContent = "";
    } else {
      inboxBadgeEl.hidden = false;
      inboxBadgeEl.textContent = String(shown.length > 99 ? "99+" : shown.length);
    }
  }
  function tabCards() {
    return state.showHidden ? [...state.cards] : state.cards.filter((card) => !card.meta.hidden);
  }
  function renderBoard() {
    const list = visibleCards();
    if (!state.groupOn) {
      const pinned2 = list.filter((card) => card.meta.pinned);
      const rest2 = list.filter((card) => !card.meta.pinned);
      return [...pinned2, ...rest2].map(renderCard);
    }
    const nodes = [];
    const pinned = list.filter((card) => card.meta.pinned);
    const rest = list.filter((card) => !card.meta.pinned);
    if (pinned.length) nodes.push(renderSection("Pinned", pinned));
    const groups = /* @__PURE__ */ new Map();
    const ungrouped = [];
    for (const card of rest) {
      const group = card.meta.group?.trim();
      if (group) {
        const bucket = groups.get(group);
        if (bucket) bucket.push(card);
        else groups.set(group, [card]);
      } else {
        ungrouped.push(card);
      }
    }
    for (const name of [...groups.keys()].sort((a, b) => a.localeCompare(b))) {
      const bucket = groups.get(name);
      if (bucket) nodes.push(renderSection(name, bucket));
    }
    if (ungrouped.length) nodes.push(renderSection("Ungrouped", ungrouped));
    if (!nodes.length && list.length) nodes.push(...list.map(renderCard));
    return nodes;
  }
  function renderSection(title, cards) {
    const section = document.createElement("section");
    section.className = "section";
    const key = `section:${title}`;
    const collapsed = Boolean(state.collapsed[key]);
    const head = document.createElement("button");
    head.className = "section-head";
    head.dataset.act = "collapse";
    head.dataset.section = key;
    head.setAttribute("aria-expanded", String(!collapsed));
    head.title = collapsed ? `Expand ${title}` : `Collapse ${title}`;
    const caret = span("", collapsed ? "\u25B8" : "\u25BE");
    const label = document.createElement("b");
    label.textContent = title;
    head.append(caret, label, span("count", String(cards.length)));
    section.append(head);
    if (!collapsed) {
      const body = div("section-body");
      const pinned = cards.filter((card) => card.meta.pinned);
      const rest = cards.filter((card) => !card.meta.pinned);
      for (const card of [...pinned, ...rest]) body.append(renderCard(card));
      section.append(body);
    }
    return section;
  }
  function renderInboxView() {
    const nodes = [];
    const filters = div("inbox-filters");
    for (const [value, label] of [["all", "All"], ["todo", "Todos"], ["step", "Plan steps"]]) {
      const button2 = document.createElement("button");
      button2.className = "seg-btn";
      button2.dataset.act = `inbox-kind-${value}`;
      button2.textContent = label;
      button2.setAttribute("aria-pressed", String(state.inboxKind === value));
      filters.append(button2);
    }
    const projectSelect = document.createElement("select");
    projectSelect.className = "sort";
    projectSelect.dataset.inboxProject = "true";
    projectSelect.setAttribute("aria-label", "Inbox project");
    const allOption = document.createElement("option");
    allOption.value = "all";
    allOption.textContent = "All projects";
    projectSelect.append(allOption);
    for (const card of tabCards()) {
      const option = document.createElement("option");
      option.value = card.project.id;
      option.textContent = card.project.name;
      projectSelect.append(option);
    }
    projectSelect.value = state.inboxProject;
    filters.append(projectSelect);
    const sortSelect = document.createElement("select");
    sortSelect.className = "sort";
    sortSelect.dataset.inboxSort = "true";
    sortSelect.setAttribute("aria-label", "Inbox sort");
    for (const [value, label] of [["old", "Oldest first"], ["new", "Newest first"], ["byproject", "By project"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      sortSelect.append(option);
    }
    sortSelect.value = state.inboxSort;
    filters.append(sortSelect);
    const groupToggle = document.createElement("button");
    groupToggle.className = "seg-btn";
    groupToggle.dataset.act = "inbox-group";
    groupToggle.textContent = "Group by project";
    groupToggle.setAttribute("aria-pressed", String(state.inboxGroup));
    filters.append(groupToggle);
    nodes.push(filters);
    const list = div("inbox-list");
    list.append(mutedLine("Read-only: OpenChamber owns these lists. Click a row to open its project."));
    if (state.inboxState === "loading" || state.inboxState === "idle") {
      list.append(mutedLine("Reading open todos and plan steps\u2026"));
    } else if (state.inboxState === "error" || !state.inbox) {
      list.append(mutedLine("Could not read the inbox."));
    } else if (!state.inbox.available || !filteredInbox().length) {
      const empty = div("empty");
      const title = document.createElement("b");
      title.textContent = "Nothing open. Nice.";
      empty.append(title);
      list.append(empty);
    } else {
      const rows = filteredInbox();
      let lastProject = "";
      for (const item of rows.slice(0, state.inboxLimit)) {
        if (state.inboxGroup && item.projectId !== lastProject) {
          lastProject = item.projectId;
          const head = div("inbox-group-head");
          head.textContent = findCard(item.projectId)?.project.name ?? item.projectId;
          list.append(head);
        }
        list.append(renderInboxRow(item));
      }
      if (rows.length > state.inboxLimit) {
        const more = actionButton(`Show ${rows.length - state.inboxLimit} more`, "inbox-more", "inbox-more");
        list.append(more);
      }
      if (state.inbox.truncated) list.append(mutedLine("Cut at 1000 items."));
    }
    nodes.push(list);
    return nodes;
  }
  function filteredInbox() {
    const items = (state.inbox?.items ?? []).filter((item) => {
      if (!state.showHidden && findCard(item.projectId)?.meta.hidden) return false;
      if (state.inboxKind !== "all" && item.kind !== state.inboxKind) return false;
      if (state.inboxProject !== "all" && item.projectId !== state.inboxProject) return false;
      return true;
    });
    const age = (item) => item.createdAt ?? Number.MAX_SAFE_INTEGER;
    const name = (item) => findCard(item.projectId)?.project.name ?? item.projectId;
    if (state.inboxGroup) {
      const dir = state.inboxSort === "new" ? -1 : 1;
      items.sort((a, b) => name(a).localeCompare(name(b)) || dir * (age(a) - age(b)));
      return items;
    }
    switch (state.inboxSort) {
      case "new":
        items.sort((a, b) => age(b) - age(a));
        break;
      case "byproject":
        items.sort((a, b) => name(a).localeCompare(name(b)) || age(a) - age(b));
        break;
      default:
        items.sort((a, b) => age(a) - age(b));
    }
    return items;
  }
  function renderInboxRow(item) {
    const card = findCard(item.projectId);
    const row = document.createElement("button");
    row.className = "inbox-row";
    row.dataset.openProject = item.projectId;
    row.title = `Open ${card?.project.name ?? item.projectId}`;
    const avatar = card ? renderAvatar(card) : div("avatar");
    row.append(avatar);
    const text = div("inbox-text");
    text.textContent = item.text;
    row.append(text);
    if (item.kind === "step" && item.plan) {
      const plan = chip(item.plan);
      plan.title = item.planFile ?? item.plan;
      row.append(plan);
    } else {
      row.append(chip(item.kind === "todo" ? "todo" : "step"));
    }
    const name = span("inbox-project", card?.project.name ?? item.projectId);
    row.append(name, inboxAge(item.createdAt));
    return row;
  }
  function inboxAge(createdAt) {
    if (!createdAt) return span("inbox-age", "\u2014");
    const days = Math.max(0, Math.floor((Date.now() - createdAt) / 864e5));
    const label = days < 1 ? "today" : `${days}d`;
    const node = span("inbox-age", label);
    if (days > 45) node.classList.add("fail");
    else if (days > 14) node.classList.add("warn");
    node.title = `${label} old`;
    return node;
  }
  async function loadInbox() {
    if (state.inboxState === "loading") return;
    state.inboxState = "loading";
    if (state.tab === "inbox") render();
    else scheduleRender();
    try {
      const response = await host.serviceRequest({ method: "GET", path: "/inbox" });
      if (response.status !== 200) throw new Error(`service answered ${response.status}`);
      state.inbox = JSON.parse(response.body);
      state.inboxState = "ready";
    } catch {
      state.inboxState = "error";
    }
    render();
  }
  var rafId = 0;
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      const active2 = document.activeElement;
      if (active2 instanceof HTMLElement && gridEl.contains(active2) && /^(INPUT|SELECT|TEXTAREA)$/.test(active2.tagName)) {
        return;
      }
      render();
    });
  }
  function visibleCards() {
    const query = state.query.trim().toLowerCase();
    const list = state.cards.filter((card) => {
      if (card.meta.hidden && !state.showHidden) return false;
      if (!query) return true;
      const haystack = [card.project.name, card.project.directory, card.meta.group ?? "", ...card.vitals?.stack ?? []].join(" ").toLowerCase();
      return haystack.includes(query);
    });
    switch (state.sort) {
      case "recent":
        list.sort((a, b) => (b.last?.updatedAt ?? 0) - (a.last?.updatedAt ?? 0));
        break;
      case "name":
        list.sort((a, b) => a.project.name.localeCompare(b.project.name));
        break;
      case "size":
        list.sort((a, b) => (b.vitals?.size.bytes ?? -1) - (a.vitals?.size.bytes ?? -1));
        break;
      default:
        list.sort((a, b) => score(b) - score(a) || a.project.name.localeCompare(b.project.name));
    }
    return list;
  }
  function score(card) {
    const last = card.last;
    let value = 0;
    for (const dep of card.vitals?.deployments ?? []) {
      if (dep.live === false) value += 500;
      if (dep.cert && (!dep.cert.authorized || dep.cert.daysLeft != null && dep.cert.daysLeft <= 7)) value += 400;
    }
    if (!last) return value;
    if (last.activity === "waiting-permission") value += 1e3;
    else if (last.activity === "waiting-question") value += 950;
    else if (last.activity === "running" || last.activity === "retrying") value += 900;
    if (last.unread) value += 800;
    if (last.outcome === "failed") value += 600;
    value += Math.max(0, 300 - (Date.now() - last.updatedAt) / 36e5);
    return value;
  }
  function renderCard(card) {
    const el2 = document.createElement("article");
    el2.className = `card${card.meta.hidden ? " dim" : ""}`;
    el2.dataset.id = card.project.id;
    if (card.project.directory === state.directory) el2.dataset.current = "true";
    const top = div("card-top");
    const dot = div("dot state-dot");
    dot.dataset.state = activityState(card.last);
    dot.title = activityTitle(card.last);
    const avatar = renderAvatar(card);
    avatar.append(dot);
    const names = div("names");
    const name = document.createElement("button");
    name.className = "name";
    name.dataset.act = "detail";
    name.textContent = card.project.name;
    name.title = `Open ${card.project.name}`;
    names.append(name);
    if (state.density === "normal") {
      names.append(span("path", card.vitals?.shortPath ?? card.project.directory));
    }
    const pin = document.createElement("button");
    pin.className = "pin";
    pin.dataset.act = "pin";
    pin.dataset.on = String(Boolean(card.meta.pinned));
    pin.setAttribute("aria-pressed", String(Boolean(card.meta.pinned)));
    pin.setAttribute("aria-label", card.meta.pinned ? `Unpin ${card.project.name}` : `Pin ${card.project.name}`);
    pin.title = pin.getAttribute("aria-label") ?? "";
    pin.textContent = card.meta.pinned ? "\u2605" : "\u2606";
    top.append(avatar, names, pin, span("ago", ago(card.last?.updatedAt)));
    const summary = document.createElement("p");
    if (card.summary) {
      summary.className = "summary";
      summary.textContent = card.summary;
    } else if (card.summaryState === "loading" || card.summaryState === "queued") {
      summary.className = "summary skeleton";
      summary.textContent = "Summary loading";
    } else if (state.ai) {
      summary.className = "summary placeholder";
      summary.textContent = card.summaryState === "error" ? "Could not write a blurb." : "No blurb yet.";
    }
    const stack = div("stack");
    for (const item of card.vitals?.stack ?? []) stack.append(span("", item));
    el2.append(top, state.density === "minimal" ? minimalMeta(card) : buildMeta(card));
    if (state.density === "minimal") {
      if (card.editingGroup) el2.append(renderGroupEditor(card));
      else {
        if (card.editingSite) el2.append(renderSiteEditor(card));
        el2.append(minimalActions(card));
      }
      return el2;
    }
    if (summary.className) el2.append(summary);
    if (stack.childElementCount) el2.append(stack);
    if (card.editingGroup) el2.append(renderGroupEditor(card));
    else {
      if (card.editingSite) el2.append(renderSiteEditor(card));
      el2.append(buildActions(card));
    }
    return el2;
  }
  function minimalMeta(card) {
    const meta = div("meta");
    if (card.vitals) {
      if (card.vitals.branch) meta.append(chip(card.vitals.branch));
      if (card.vitals.dirty) meta.append(chip(`\xB1${card.vitals.dirty}`, "warn"));
      if (card.vitals.ahead) {
        const up = chip(`\u2191${card.vitals.ahead}`, "warn");
        up.title = `${card.vitals.ahead} unpushed commit${card.vitals.ahead === 1 ? "" : "s"}`;
        meta.append(up);
      }
      if (card.vitals.behind) {
        const down = chip(`\u2193${card.vitals.behind}`);
        down.title = `${card.vitals.behind} commit${card.vitals.behind === 1 ? "" : "s"} behind the upstream`;
        meta.append(down);
      }
      if (card.vitals.dirty && card.vitals.dirtySince) {
        const ageDays = Math.floor((Date.now() - card.vitals.dirtySince) / 864e5);
        if (ageDays >= 3) {
          const stale = chip(`dirty ${ageDays}d`, "warn");
          stale.title = `Uncommitted changes since ${new Date(card.vitals.dirtySince).toLocaleDateString()}`;
          meta.append(stale);
        }
      }
    } else if (card.vitalsError) {
      meta.append(chip(card.vitalsError, "fail"));
    }
    if (card.last?.outcome === "failed") meta.append(chip("last turn failed", "fail"));
    if (!card.editingGroup) {
      const group = chip(card.meta.group?.trim() ? card.meta.group.trim() : "+ group", "edit");
      group.dataset.act = "edit-group";
      group.title = card.meta.group ? `Group: ${card.meta.group}. Click to change it.` : "Put this project in a group.";
      meta.append(group);
    }
    for (const dep of card.vitals?.deployments ?? []) {
      const badCert = dep.cert && (!dep.cert.authorized || dep.cert.daysLeft != null && dep.cert.daysLeft <= 21);
      if (dep.live === false || badCert) meta.append(deploymentChip(dep));
    }
    return meta;
  }
  function minimalActions(card) {
    const actions = div("actions");
    actions.append(actionButton(card.last ? "Resume" : "Start chat", "open", "primary"));
    actions.append(actionButton("Folder", "folder"));
    if (card.vitals?.web) actions.append(actionButton("GitHub", "github"));
    actions.append(actionButton(card.meta.hidden ? "Unhide" : "Hide", card.meta.hidden ? "unhide" : "hide"));
    return actions;
  }
  function buildMeta(card) {
    const meta = div("meta");
    if (card.vitals) {
      if (card.vitals.branch) meta.append(chip(card.vitals.branch));
      if (card.vitals.dirty) meta.append(chip(`\xB1${card.vitals.dirty}`, "warn"));
      if (card.vitals.ahead) {
        const up = chip(`\u2191${card.vitals.ahead}`, "warn");
        up.title = `${card.vitals.ahead} unpushed commit${card.vitals.ahead === 1 ? "" : "s"}`;
        meta.append(up);
      }
      if (card.vitals.behind) {
        const down = chip(`\u2193${card.vitals.behind}`);
        down.title = `${card.vitals.behind} commit${card.vitals.behind === 1 ? "" : "s"} behind the upstream`;
        meta.append(down);
      }
      if (card.vitals.dirty && card.vitals.dirtySince) {
        const ageDays = Math.floor((Date.now() - card.vitals.dirtySince) / 864e5);
        if (ageDays >= 3) {
          const stale = chip(`dirty ${ageDays}d`, "warn");
          stale.title = `Uncommitted changes since ${new Date(card.vitals.dirtySince).toLocaleDateString()}`;
          meta.append(stale);
        }
      }
      if (card.vitals.kind === "folder") meta.append(chip("folder"));
      meta.append(chip(sizeLabel(card)));
      if (card.vitals.size.state === "ready" && card.vitals.size.files) {
        meta.append(chip(`${card.vitals.size.files.toLocaleString()} files`));
      }
    } else if (card.vitalsError) {
      meta.append(chip(card.vitalsError, "fail"));
    }
    if (card.chats) meta.append(chip(`${card.chats} chat${card.chats === 1 ? "" : "s"}`));
    if (card.worktrees) meta.append(chip(`${card.worktrees} tree${card.worktrees === 1 ? "" : "s"}`));
    if (card.last?.outcome === "failed") meta.append(chip("last turn failed", "fail"));
    if (!card.editingGroup) {
      const group = chip(card.meta.group?.trim() ? card.meta.group.trim() : "+ group", "edit");
      group.dataset.act = "edit-group";
      group.title = card.meta.group ? `Group: ${card.meta.group}. Click to change it.` : "Put this project in a group.";
      meta.append(group);
    }
    const deployments = card.vitals?.deployments ?? [];
    for (const dep of deployments.slice(0, 3)) meta.append(deploymentChip(dep));
    if (!card.editingSite) {
      const edit = chip(deployments.length ? "edit site" : "+ site", "edit");
      edit.dataset.act = "edit-site";
      meta.append(edit);
    }
    return meta;
  }
  function buildActions(card) {
    const actions = div("actions");
    actions.append(actionButton(card.last ? "Resume" : "Start chat", "open", "primary"));
    if (card.last) actions.append(actionButton("New chat", "new"));
    actions.append(actionButton("Folder", "folder"));
    if (card.project.directory === state.directory) {
      actions.append(actionButton("Files", "files"), actionButton("Git", "git"));
    }
    if (card.vitals?.web) actions.append(actionButton("GitHub", "github"));
    actions.append(actionButton("Copy path", "copy"));
    if (card.summary) actions.append(actionButton("Rewrite", "rewrite"));
    actions.append(actionButton(card.meta.hidden ? "Unhide" : "Hide", card.meta.hidden ? "unhide" : "hide"));
    return actions;
  }
  function renderDetail(card) {
    const wrap = div("detail");
    const head = div("detail-head");
    head.append(actionButton("\u2190 All projects", "back"));
    const identity = div("detail-identity");
    const dot = div("dot state-dot");
    dot.dataset.state = activityState(card.last);
    dot.title = activityTitle(card.last);
    const avatar = renderAvatar(card, "lg");
    avatar.append(dot);
    const titles = div("detail-title");
    const heading = document.createElement("h2");
    heading.textContent = card.project.name;
    titles.append(heading, span("path", card.vitals?.shortPath ?? card.project.directory));
    identity.append(avatar, titles);
    head.append(identity);
    wrap.append(head);
    wrap.append(buildMeta(card));
    if (card.summary) {
      const summary = document.createElement("p");
      summary.className = "detail-summary";
      summary.textContent = card.summary;
      wrap.append(summary);
    }
    wrap.append(buildActions(card));
    if (card.editingGroup) wrap.append(renderGroupEditor(card));
    if (card.editingSite) wrap.append(renderSiteEditor(card));
    wrap.append(renderActivityPanel(card));
    wrap.append(renderGitPanel(card));
    wrap.append(renderDeploymentsPanel(card));
    wrap.append(renderSpendPanel(card));
    wrap.append(renderDiskPanel(card));
    wrap.append(renderKnowledgePanel(card));
    return wrap;
  }
  function renderActivityPanel(card) {
    const section = div("panel");
    const head = div("panel-head");
    const title = document.createElement("h3");
    title.textContent = "Activity";
    const seg = div("seg");
    for (const days of [7, 30, 90]) {
      const button2 = document.createElement("button");
      button2.className = "seg-btn";
      button2.dataset.act = `range-${days}`;
      button2.textContent = `${days}d`;
      button2.setAttribute("aria-pressed", String(state.range === days));
      seg.append(button2);
    }
    head.append(title, seg);
    section.append(head);
    if (state.activityState === "loading" || state.activityState === "idle") {
      section.append(mutedLine("Reading activity\u2026"));
      return section;
    }
    if (state.activityState === "error") {
      section.append(mutedLine("Could not read activity for this project."));
      return section;
    }
    const data = state.activity;
    if (!data) return section;
    if (!data.available) {
      section.append(
        mutedLine("The opencode CLI was not found, so there is no daily series. Plans and todos still load.")
      );
    } else {
      const stats = div("stats");
      const cells = [
        [data.steps.toLocaleString(), "steps"],
        [data.prompts.toLocaleString(), "prompts"],
        [data.sessions.toLocaleString(), "sessions"],
        [data.activeDays.toLocaleString(), "active days"],
        [data.streak.toLocaleString(), "day streak"],
        [data.cost ? `$${data.cost.toFixed(2)}` : "\u2014", "cost"]
      ];
      for (const [value, label] of cells) {
        const cell = div("stat");
        const strong = document.createElement("b");
        strong.textContent = value;
        cell.append(strong, span("", label));
        stats.append(cell);
      }
      section.append(stats);
      section.append(renderChart(data.points));
    }
    return section;
  }
  function renderChart(points) {
    const wrap = div("chart-wrap");
    const chart = div("chart");
    const max = Math.max(1, ...points.map((point) => point.steps));
    for (const point of points) {
      const column = div("chart-col");
      column.title = `${point.date} \xB7 ${point.steps.toLocaleString()} steps`;
      const bar = div("chart-bar");
      bar.style.height = `${Math.max(2, Math.round(point.steps / max * 100))}%`;
      if (!point.steps) bar.dataset.zero = "true";
      column.append(bar);
      chart.append(column);
    }
    const legend = div("chart-legend");
    legend.append(span("", points[0]?.date ?? ""), span("", points[points.length - 1]?.date ?? ""));
    wrap.append(chart, legend);
    return wrap;
  }
  function renderGitPanel(card) {
    const section = div("panel");
    const head = div("panel-head");
    const title = document.createElement("h3");
    title.textContent = "Commits";
    head.append(title);
    section.append(head);
    if (state.gitFor !== card.project.id || state.gitState === "loading" || state.gitState === "idle") {
      section.append(mutedLine("Reading commit history\u2026"));
      return section;
    }
    if (state.gitState === "error" || !state.git) {
      section.append(mutedLine("Could not read commit history for this project."));
      return section;
    }
    const data = state.git;
    if (!data.available) {
      section.append(mutedLine("Not a git repository, so there is no commit history."));
      return section;
    }
    section.append(renderHeatmap(data.days));
    const stats = div("stats");
    const cells = [
      [data.total.toLocaleString(), "commits in 26 weeks"],
      [data.currentStreak.toLocaleString(), "current streak (days)"],
      [data.bestStreak.toLocaleString(), "best streak (days)"]
    ];
    for (const [value, label] of cells) {
      const cell = div("stat");
      const strong = document.createElement("b");
      strong.textContent = value;
      cell.append(strong, span("", label));
      stats.append(cell);
    }
    section.append(stats);
    if (data.lastCommit) {
      const recent = ago(data.lastCommit.at);
      section.append(
        mutedLine(
          `Last commit ${data.lastCommit.hash} \u2014 ${data.lastCommit.subject || "(no message)"} \xB7 ${recent && recent !== "now" ? `${recent} ago` : "just now"}`
        )
      );
    }
    if (data.upstream) {
      const sync = [];
      if (data.ahead) sync.push(`\u2191${data.ahead} unpushed`);
      if (data.behind) sync.push(`\u2193${data.behind} behind`);
      if (sync.length) section.append(mutedLine(`${data.upstream}: ${sync.join(", ")}`));
    }
    return section;
  }
  function renderHeatmap(days) {
    const wrap = div("heat-wrap");
    const max = Math.max(0, ...days.map((day) => day.commits));
    const levelOf = (commits) => {
      if (!commits || max <= 0) return 0;
      return 1 + Math.min(3, Math.floor(commits / max * 4));
    };
    const first = days.length ? /* @__PURE__ */ new Date(`${days[0].date}T12:00:00`) : /* @__PURE__ */ new Date();
    const pad = (first.getDay() + 6) % 7;
    const cells = [...Array(pad).fill(null), ...days];
    const weeks = Math.max(1, Math.ceil(cells.length / 7));
    const months = div("heat-months");
    months.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;
    let lastMonth = "";
    for (let week = 0; week < weeks; week += 1) {
      const cell = cells[week * 7];
      const label = span("", "");
      if (cell) {
        const month = (/* @__PURE__ */ new Date(`${cell.date}T12:00:00`)).toLocaleString(void 0, { month: "short" });
        if (month !== lastMonth) {
          label.textContent = month;
          lastMonth = month;
        }
      }
      months.append(label);
    }
    const grid = div("heat");
    grid.style.gridTemplateColumns = `repeat(${weeks}, 1fr)`;
    for (let week = 0; week < weeks; week += 1) {
      for (let row = 0; row < 7; row += 1) {
        const cell = cells[week * 7 + row];
        const node = div("heat-cell");
        if (!cell) {
          node.dataset.level = "empty";
        } else {
          node.dataset.level = String(levelOf(cell.commits));
          node.title = `${cell.date}, ${cell.commits} commit${cell.commits === 1 ? "" : "s"}`;
        }
        node.style.gridRow = String(row + 1);
        node.style.gridColumn = String(week + 1);
        grid.append(node);
      }
    }
    wrap.append(months, grid);
    return wrap;
  }
  function renderDeploymentsPanel(card) {
    const section = div("panel");
    const head = div("panel-head");
    const title = document.createElement("h3");
    title.textContent = "Deployments";
    const check = actionButton("Check now", "check-now");
    head.append(title, check);
    section.append(head);
    section.append(
      mutedLine("Checks observed while Atlas is open \u2014 not continuous monitoring.")
    );
    const deployments = card.vitals?.deployments ?? [];
    if (!deployments.length) {
      section.append(mutedLine("No deployments detected. Add one with + site on the card."));
      return section;
    }
    const history = state.probes.get(card.project.id) ?? {};
    for (const dep of deployments) {
      const row = div("dep-row");
      const dot = document.createElement("i");
      dot.className = "mini-dot";
      dot.dataset.live = dep.live === true ? "up" : dep.live === false ? "down" : "unknown";
      const link = document.createElement("button");
      link.className = "dep-host";
      link.dataset.act = "deploy";
      link.dataset.url = dep.url;
      link.textContent = hostOf(dep.url) ?? dep.label;
      link.title = `${dep.label} \xB7 ${dep.source} \u2014 open it`;
      row.append(dot, link);
      const facts = [];
      facts.push(dep.status ? `HTTP ${dep.status}` : dep.live === false ? "unreachable" : "not checked");
      if (dep.ms != null) facts.push(`${dep.ms} ms`);
      if (dep.cert?.validTo != null) {
        const days = dep.cert.daysLeft;
        facts.push(days != null && days < 0 ? `cert expired ${new Date(dep.cert.validTo).toLocaleDateString()}` : `cert expires ${new Date(dep.cert.validTo).toLocaleDateString()} (${days}d)`);
      }
      row.append(span("dep-facts", facts.join(" \xB7 ")));
      const entries = history[dep.url] ?? [];
      const downSince = downSinceMs(entries);
      if (dep.live === false && downSince != null) {
        const recent = ago(downSince);
        const down = span("dep-down", `down since ${recent && recent !== "now" ? `${recent} ago` : "just now"}`);
        row.append(down);
      }
      if (entries.length) {
        const dots = div("probe-dots");
        for (const entry of entries.slice(-20)) {
          const mark = document.createElement("i");
          mark.className = "probe-dot";
          mark.dataset.live = entry.live === true ? "up" : entry.live === false ? "down" : "unknown";
          mark.title = `${new Date(entry.at).toLocaleString()} \xB7 ${entry.live === true ? "up" : entry.live === false ? "down" : "unknown"}${entry.ms != null ? ` \xB7 ${entry.ms} ms` : ""}`;
          dots.append(mark);
        }
        row.append(dots);
      }
      section.append(row);
    }
    return section;
  }
  function renderSpendBoardView() {
    const nodes = [];
    const filters = div("inbox-filters");
    for (const days of [7, 30, 90]) {
      const button2 = document.createElement("button");
      button2.className = "seg-btn";
      button2.dataset.act = `range-${days}`;
      button2.textContent = `${days}d`;
      button2.setAttribute("aria-pressed", String(state.range === days));
      filters.append(button2);
    }
    nodes.push(filters);
    const list = div("spend-list");
    list.append(mutedLine(`Model tokens per project over the last ${state.range} days.`));
    const cards = tabCards();
    if (state.spendBoardState === "loading") {
      list.append(
        mutedLine(
          `Reading ${state.spendBoardProgress.done} of ${state.spendBoardProgress.total}\u2026`
        )
      );
    }
    const rows = cards.map((card) => ({ card, spend: state.spendBoard.get(card.project.id) ?? null })).filter((row) => row.spend && row.spend.available && row.spend.tokens.total > 0).sort((a, b) => (b.spend?.tokens.total ?? 0) - (a.spend?.tokens.total ?? 0));
    if (!rows.length && state.spendBoardState === "ready") {
      list.append(mutedLine("No model usage reported for this range."));
    }
    const max = Math.max(1, ...rows.map((row) => row.spend?.tokens.total ?? 0));
    const showCost = rows.some((row) => (row.spend?.cost ?? 0) > 0);
    let totalTokens = 0;
    let totalCost = 0;
    for (const { card, spend } of rows) {
      totalTokens += spend?.tokens.total ?? 0;
      totalCost += spend?.cost ?? 0;
      const row = document.createElement("button");
      row.className = "spend-row";
      row.dataset.openProject = card.project.id;
      row.title = `Open ${card.project.name}`;
      row.append(span("spend-name", card.project.name));
      const track = div("spend-track");
      const fill = document.createElement("i");
      fill.className = "spend-fill";
      fill.style.width = `${Math.max(1, Math.round((spend?.tokens.total ?? 0) / max * 100))}%`;
      fill.style.background = card.iconColor || hueColor(card.project.id);
      track.append(fill);
      row.append(track);
      row.append(
        span(
          "spend-value",
          tokensLabel(spend?.tokens.total ?? 0) + (showCost && (spend?.cost ?? 0) > 0 ? ` \xB7 $${(spend?.cost ?? 0).toFixed(2)}` : "")
        )
      );
      list.append(row);
    }
    if (rows.length) {
      const total = document.createElement("div");
      total.className = "spend-row total";
      total.append(span("spend-name", `${rows.length} project${rows.length === 1 ? "" : "s"}`));
      const track = div("spend-track");
      total.append(track);
      total.append(
        span("spend-value", tokensLabel(totalTokens) + (showCost ? ` \xB7 $${totalCost.toFixed(2)}` : ""))
      );
      list.append(total);
    }
    nodes.push(list);
    return nodes;
  }
  function downSinceMs(entries) {
    let first = null;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index].live !== false) break;
      first = entries[index].at;
    }
    return first;
  }
  function renderSpendPanel(card) {
    const section = div("panel");
    const head = div("panel-head");
    const title = document.createElement("h3");
    title.textContent = "Spend";
    const seg = div("seg");
    for (const days of [7, 30, 90]) {
      const button2 = document.createElement("button");
      button2.className = "seg-btn";
      button2.dataset.act = `range-${days}`;
      button2.textContent = `${days}d`;
      button2.setAttribute("aria-pressed", String(state.range === days));
      seg.append(button2);
    }
    head.append(title, seg);
    section.append(head);
    if (state.spendFor !== card.project.id || state.spendState === "loading" || state.spendState === "idle") {
      section.append(mutedLine("Reading model usage\u2026"));
      return section;
    }
    if (state.spendState === "error" || !state.spend) {
      section.append(mutedLine("Could not read spend for this project."));
      return section;
    }
    const data = state.spend;
    section.append(mutedLine(`Last ${data.days} days. Tokens include cache reads.`));
    if (!data.available || data.tokens.total <= 0 && data.cost <= 0) {
      section.append(mutedLine("No model usage reported for this range."));
      return section;
    }
    const stats = div("stats");
    const cells = [
      [tokensLabel(data.tokens.total), "tokens"],
      [data.cost > 0 ? `$${data.cost.toFixed(2)}` : "not reported", "cost"],
      [data.sessions.toLocaleString(), "sessions"]
    ];
    for (const [value, label] of cells) {
      const cell = div("stat");
      const strong = document.createElement("b");
      strong.textContent = value;
      cell.append(strong, span("", label));
      stats.append(cell);
    }
    section.append(stats);
    if (data.models.length) {
      const bar = div("spend-bar");
      for (const model of data.models) {
        if (model.share <= 0) continue;
        const segFill = document.createElement("i");
        segFill.className = "spend-seg";
        segFill.style.width = `${Math.max(1, Math.round(model.share * 100))}%`;
        segFill.style.background = hueColor(model.name);
        segFill.title = `${model.name} \xB7 ${Math.round(model.share * 100)}%`;
        bar.append(segFill);
      }
      section.append(bar);
      const legend = div("spend-legend");
      for (const model of data.models) {
        const row = div("spend-legend-row");
        const swatch = document.createElement("i");
        swatch.className = "spend-swatch";
        swatch.style.background = hueColor(model.name);
        row.append(swatch, span("", model.name));
        const value = span("spend-value", `${tokensLabel(model.tokens)} \xB7 ${Math.round(model.share * 100)}%`);
        row.append(value);
        legend.append(row);
      }
      section.append(legend);
    }
    return section;
  }
  function renderDiskPanel(card) {
    const section = div("panel");
    const head = div("panel-head");
    const title = document.createElement("h3");
    title.textContent = "Disk";
    head.append(title);
    section.append(head);
    section.append(mutedLine("Read-only: nothing here deletes anything."));
    if (state.diskFor !== card.project.id || state.diskState === "loading" || state.diskState === "idle") {
      section.append(mutedLine("Walking the folder\u2026"));
      return section;
    }
    if (state.diskState === "error" || !state.disk) {
      section.append(mutedLine("Could not measure this folder."));
      return section;
    }
    const data = state.disk;
    if (!data.available) {
      section.append(mutedLine("This folder is not on disk."));
      return section;
    }
    if (data.truncated) section.append(mutedLine("Partial: the walk stopped early (time or file budget)."));
    const bar = div("disk-bar");
    for (const category of data.categories) {
      if (category.bytes <= 0 || data.total <= 0) continue;
      const segFill = document.createElement("i");
      segFill.className = "disk-seg";
      segFill.style.width = `${Math.max(1, Math.round(category.bytes / data.total * 100))}%`;
      segFill.style.background = hueColor(`disk:${category.id}`);
      segFill.title = `${category.label} \xB7 ${bytes(category.bytes)}`;
      bar.append(segFill);
    }
    section.append(bar);
    const reclaimable = data.categories.filter((category) => category.reclaimable && category.bytes > 0);
    section.append(
      mutedLine(
        reclaimable.length ? `Reclaimable: ${bytes(data.reclaimableBytes)} (${reclaimable.map((category) => category.label).join(", ")})` : "Nothing reclaimable found."
      )
    );
    const rows = div("disk-rows");
    for (const category of data.categories) {
      if (category.files <= 0) continue;
      rows.append(diskRow(category.label, category.bytes, data.total, hueColor(`disk:${category.id}`), category.paths[0] ?? null));
    }
    if (data.children.length) {
      const headRow = div("inbox-group-head");
      headRow.textContent = "Largest in the project root";
      rows.append(headRow);
      for (const child of data.children) {
        rows.append(diskRow(child.name + (child.isDir ? "/" : ""), child.bytes, data.total, null, child.name));
      }
    }
    section.append(rows);
    return section;
  }
  function diskRow(label, value, total, color, rel) {
    const row = div("disk-row");
    if (color) {
      const swatch = document.createElement("i");
      swatch.className = "spend-swatch";
      swatch.style.background = color;
      row.append(swatch);
    }
    const name = span("disk-label", label);
    if (rel) name.title = rel;
    row.append(name);
    row.append(span("disk-value", `${bytes(value)}${total > 0 ? ` \xB7 ${Math.round(value / total * 100)}%` : ""}`));
    if (rel) {
      const reveal = actionButton("Reveal", "reveal-path");
      reveal.dataset.rel = rel;
      const copy = actionButton("Copy path", "copy-rel");
      copy.dataset.rel = rel;
      row.append(reveal, copy);
    }
    return row;
  }
  function tokensLabel(value) {
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
    return String(Math.round(value));
  }
  function joinDiskPath(directory, rel) {
    const sep = directory.includes("\\") ? "\\" : "/";
    const clean = rel.replace(/[\\/]+/g, sep);
    return directory.endsWith(sep) ? directory + clean : directory + sep + clean;
  }
  async function revealDiskPath(card, rel) {
    try {
      const response = await host.serviceRequest({
        method: "POST",
        path: "/reveal",
        body: JSON.stringify({ directory: card.project.directory, path: rel })
      });
      if (response.status === 200) toast("success", "Opened in the file manager");
      else toast("error", "Could not open that path");
    } catch (error) {
      toast("error", messageOf(error));
    }
  }
  function renderKnowledgePanel(card) {
    const section = div("panel");
    const head = div("panel-head");
    const title = document.createElement("h3");
    title.textContent = "Plans & todos";
    const knowledge = state.activity?.knowledge ?? null;
    if (!knowledge?.available) {
      head.append(title);
      section.append(head, mutedLine("No notes, todos or plans for this project."));
      return section;
    }
    head.append(title, chip(`${knowledge.openTodos} open todo${knowledge.openTodos === 1 ? "" : "s"}`, knowledge.openTodos ? "warn" : ""));
    section.append(head);
    const openPlans = knowledge.plans.filter((plan) => plan.open > 0);
    const openSteps = knowledge.plans.reduce((sum, plan) => sum + plan.open, 0);
    section.append(
      mutedLine(
        `${knowledge.plans.length} plan${knowledge.plans.length === 1 ? "" : "s"} \xB7 ${openSteps} open step${openSteps === 1 ? "" : "s"}${knowledge.notes ? ` \xB7 ${knowledge.notes} note${knowledge.notes === 1 ? "" : "s"}` : ""}`
      )
    );
    if (knowledge.plans.length) {
      const list = div("plans");
      for (const plan of knowledge.plans.slice(0, 8)) {
        const row = div("plan");
        const top = div("plan-top");
        const name = span("plan-title", plan.title);
        name.title = plan.file;
        top.append(name, chip(`${plan.open} open`, plan.open ? "warn" : ""));
        const bar = div("progress");
        const fill = document.createElement("i");
        fill.style.width = plan.total ? `${Math.round(plan.done / plan.total * 100)}%` : "0%";
        bar.append(fill);
        row.append(top, bar, mutedLine(`${plan.done}/${plan.total} steps`));
        list.append(row);
      }
      section.append(list);
    } else if (!openPlans.length) {
      section.append(mutedLine("No plans yet."));
    }
    if (knowledge.todos.length) {
      const list = document.createElement("ul");
      list.className = "todos";
      for (const todo of knowledge.todos) {
        const item = document.createElement("li");
        item.textContent = todo.text;
        list.append(item);
      }
      section.append(list);
      if (knowledge.openTodos > knowledge.todos.length) {
        section.append(mutedLine(`+ ${knowledge.openTodos - knowledge.todos.length} more open`));
      }
    }
    return section;
  }
  function mutedLine(text) {
    const node = div("muted");
    node.textContent = text;
    return node;
  }
  async function loadActivity(card, days = state.range) {
    state.activityFor = card.project.id;
    state.activityState = "loading";
    state.activity = null;
    render();
    try {
      const response = await host.serviceRequest({
        method: "GET",
        path: "/activity",
        query: { directory: card.project.directory, projectId: card.project.id, days: String(days) }
      });
      if (response.status !== 200) throw new Error(`service answered ${response.status}`);
      if (state.activityFor !== card.project.id) return;
      state.activity = JSON.parse(response.body);
      state.activityState = "ready";
    } catch {
      if (state.activityFor !== card.project.id) return;
      state.activityState = "error";
    }
    render();
  }
  async function loadSpend(card, days = state.range) {
    state.spendFor = card.project.id;
    state.spendState = "loading";
    state.spend = null;
    render();
    try {
      const response = await host.serviceRequest({
        method: "GET",
        path: "/spend",
        query: { directory: card.project.directory, days: String(days) }
      });
      if (response.status !== 200) throw new Error(`service answered ${response.status}`);
      if (state.spendFor !== card.project.id) return;
      state.spend = JSON.parse(response.body);
      state.spendState = "ready";
    } catch {
      if (state.spendFor !== card.project.id) return;
      state.spendState = "error";
    }
    render();
  }
  async function loadDisk(card) {
    state.diskFor = card.project.id;
    state.diskState = "loading";
    state.disk = null;
    render();
    try {
      const response = await host.serviceRequest({
        method: "GET",
        path: "/disk",
        query: { directory: card.project.directory }
      });
      if (response.status !== 200) throw new Error(`service answered ${response.status}`);
      if (state.diskFor !== card.project.id) return;
      state.disk = JSON.parse(response.body);
      state.diskState = "ready";
    } catch {
      if (state.diskFor !== card.project.id) return;
      state.diskState = "error";
    }
    render();
  }
  async function loadSpendBoard() {
    if (state.spendBoardState === "loading") return;
    const cards = tabCards();
    state.spendBoardState = "loading";
    state.spendBoardProgress = { done: 0, total: cards.length };
    render();
    for (const card of cards) {
      try {
        const response = await host.serviceRequest({
          method: "GET",
          path: "/spend",
          query: { directory: card.project.directory, days: String(state.range) }
        });
        if (response.status === 200) {
          state.spendBoard.set(card.project.id, JSON.parse(response.body));
        }
      } catch {
      }
      state.spendBoardProgress.done += 1;
      scheduleRender();
    }
    state.spendBoardState = "ready";
    render();
  }
  async function loadGit(card) {
    state.gitFor = card.project.id;
    state.gitState = "loading";
    state.git = null;
    render();
    try {
      const response = await host.serviceRequest({
        method: "GET",
        path: "/git",
        query: { directory: card.project.directory }
      });
      if (response.status !== 200) throw new Error(`service answered ${response.status}`);
      if (state.gitFor !== card.project.id) return;
      state.git = JSON.parse(response.body);
      state.gitState = "ready";
    } catch {
      if (state.gitFor !== card.project.id) return;
      state.gitState = "error";
    }
    render();
  }
  async function recordProbes(card) {
    const deployments = card.vitals?.deployments ?? [];
    if (!deployments.length) return;
    let history = state.probes.get(card.project.id);
    if (!history) {
      history = {};
      state.probes.set(card.project.id, history);
    }
    let dirty = false;
    const now = Date.now();
    for (const dep of deployments) {
      const entries = history[dep.url] ?? [];
      const last = entries[entries.length - 1];
      if (last && now - last.at < 5 * 6e4) continue;
      entries.push({ at: now, live: dep.live, ms: dep.ms ?? null });
      history[dep.url] = entries.slice(-40);
      dirty = true;
    }
    if (dirty) {
      await host.storage.set(`${PROBE_PREFIX}${card.project.id}`, history).catch(() => {
      });
    }
  }
  function renderSiteEditor(card) {
    const row = div("editor");
    const input = document.createElement("input");
    input.type = "url";
    input.placeholder = "https://example.com";
    input.value = card.siteDraft || card.manualSite || "";
    input.dataset.siteInput = card.project.id;
    input.setAttribute("aria-label", `Live site for ${card.project.name}`);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveSite(card);
      }
      if (event.key === "Escape") {
        card.editingSite = false;
        render();
      }
    });
    const save = actionButton("Save", "save-site", "primary");
    const cancel = actionButton("Cancel", "cancel-site");
    row.append(input, save, cancel);
    requestAnimationFrame(() => input.focus());
    return row;
  }
  function renderGroupEditor(card) {
    const row = div("editor");
    const input = document.createElement("input");
    input.placeholder = "Group name (empty clears)\u2026";
    input.value = card.groupDraft;
    input.dataset.groupInput = card.project.id;
    input.setAttribute("aria-label", `Group for ${card.project.name}`);
    input.setAttribute("list", "atlas-groups");
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void saveGroup(card);
      }
      if (event.key === "Escape") {
        card.editingGroup = false;
        render();
      }
    });
    const data = document.createElement("datalist");
    data.id = "atlas-groups";
    for (const group of existingGroups()) {
      const option = document.createElement("option");
      option.value = group;
      data.append(option);
    }
    const save = actionButton("Save", "save-group", "primary");
    const cancel = actionButton("Cancel", "cancel-group");
    row.append(input, data, save, cancel);
    requestAnimationFrame(() => input.focus());
    return row;
  }
  function existingGroups() {
    const names = /* @__PURE__ */ new Set();
    for (const card of state.cards) {
      const group = card.meta.group?.trim();
      if (group) names.add(group);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }
  function actionButton(label, act, cls = "") {
    const button2 = document.createElement("button");
    button2.className = `act ${cls}`.trim();
    button2.dataset.act = act;
    button2.textContent = label;
    return button2;
  }
  function renderAvatar(card, extra = "") {
    const box = div(`avatar ${extra}`.trim());
    box.style.background = card.iconColor || hueColor(card.project.id || card.project.name);
    const letter = document.createElement("span");
    letter.className = "avatar-letter";
    letter.textContent = (card.project.name || "?").trim().charAt(0).toUpperCase();
    box.append(letter);
    const url = card.icon ?? card.vitals?.iconUrl ?? null;
    if (url) {
      const img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.addEventListener("load", () => {
        letter.style.display = "none";
      });
      img.addEventListener("error", () => img.remove());
      img.src = url;
      box.append(img);
    }
    return box;
  }
  function hueColor(seed) {
    let hash = 0;
    for (let index = 0; index < seed.length; index += 1) {
      hash = hash * 31 + seed.charCodeAt(index) >>> 0;
    }
    return `hsl(${hash % 360} 45% 38%)`;
  }
  function deploymentChip(dep) {
    const button2 = document.createElement("button");
    button2.className = "chip link dep";
    button2.dataset.act = "deploy";
    button2.dataset.url = dep.url;
    const dot = document.createElement("i");
    dot.className = "mini-dot";
    dot.dataset.live = dep.live === true ? "up" : dep.live === false ? "down" : "unknown";
    button2.append(dot, document.createTextNode(hostOf(dep.url) ?? dep.label));
    button2.append(certBadge(dep.cert));
    const detail = dep.status ? `HTTP ${dep.status}` : dep.live === false ? "unreachable" : "not checked yet";
    button2.title = `${dep.label} \xB7 ${dep.source} \xB7 ${detail}${dep.ms != null ? ` \xB7 ${dep.ms} ms` : ""}${certTitle(dep.cert)}`;
    return button2;
  }
  function certBadge(cert) {
    const badge = document.createElement("span");
    if (!cert || cert.daysLeft == null) return badge;
    if (cert.daysLeft < 0) {
      badge.className = "cert fail";
      badge.textContent = "cert expired";
    } else if (!cert.authorized || cert.daysLeft <= 7) {
      badge.className = "cert fail";
      badge.textContent = `cert ${cert.daysLeft}d`;
    } else if (cert.daysLeft <= 21) {
      badge.className = "cert warn";
      badge.textContent = `cert ${cert.daysLeft}d`;
    }
    return badge;
  }
  function certTitle(cert) {
    if (!cert || cert.validTo == null) return "";
    const expiry = new Date(cert.validTo).toLocaleDateString();
    const issuer = cert.issuer ? `, issued to ${cert.issuer}` : "";
    const state2 = cert.daysLeft != null && cert.daysLeft < 0 ? "expired" : cert.authorized ? "valid" : `invalid (${cert.error ?? "not trusted"})`;
    return ` \xB7 cert ${state2}, expires ${expiry}${issuer}`;
  }
  function footerText() {
    const hidden = state.cards.filter((card) => card.meta.hidden);
    const visibleCount = state.cards.length - hidden.length;
    const parts = [`${visibleCount} project${visibleCount === 1 ? "" : "s"}`];
    if (hidden.length && !state.showHidden) parts.push(`${hidden.length} hidden`);
    if (state.serviceDown) parts.push("local service offline");
    const measuring = state.cards.filter((card) => card.vitals?.size.state === "running").length;
    if (measuring) parts.push(`measuring ${measuring}`);
    return parts.join(" \xB7 ");
  }
  async function boot() {
    try {
      const settings = await host.storage.get(SETTINGS_KEY).catch(() => null);
      if (settings) {
        if (typeof settings.ai === "boolean") state.ai = settings.ai;
        if (typeof settings.groupOn === "boolean") state.groupOn = settings.groupOn;
        if (typeof settings.showHidden === "boolean") state.showHidden = settings.showHidden;
        if (settings.collapsed && typeof settings.collapsed === "object") state.collapsed = settings.collapsed;
        if (settings.density === "minimal" || settings.density === "normal") state.density = settings.density;
        if (settings.view === "board" || settings.view === "inbox" || settings.view === "spend") state.tab = settings.view;
      }
      aiEl.checked = state.ai;
      const keys = await host.storage.keys().catch(() => []);
      await Promise.all(
        keys.map(async (key) => {
          if (key.startsWith(SUMMARY_PREFIX)) {
            const value = await host.storage.get(key).catch(() => null);
            if (value && typeof value.text === "string" && typeof value.hash === "string") {
              summaryCache.set(key.slice(SUMMARY_PREFIX.length), value);
            }
          } else if (key.startsWith(SITE_PREFIX)) {
            const value = await host.storage.get(key).catch(() => null);
            if (value && typeof value.site === "string") siteCache.set(key.slice(SITE_PREFIX.length), value.site);
          } else if (key.startsWith(META_PREFIX)) {
            const value = await host.storage.get(key).catch(() => null);
            if (value && typeof value === "object") {
              metaCache.set(key.slice(META_PREFIX.length), {
                pinned: value.pinned === true,
                group: typeof value.group === "string" && value.group.trim() ? value.group.trim() : null,
                hidden: value.hidden === true
              });
            }
          } else if (key.startsWith(PROBE_PREFIX)) {
            const value = await host.storage.get(key).catch(() => null);
            if (value && typeof value === "object") {
              const id = key.slice(PROBE_PREFIX.length);
              state.probes.set(id, value);
            }
          }
        })
      );
      await loadProjectIcons();
      const snapshot = await host.listProjects();
      state.cards = (snapshot.projects ?? []).map((project) => {
        const known = iconIndex.get(project.id) ?? iconIndex.get(normDir(project.directory));
        const meta = metaCache.get(project.id);
        return {
          project,
          sessions: [],
          last: null,
          chats: 0,
          worktrees: 0,
          vitals: null,
          vitalsError: null,
          summary: summaryCache.get(project.id)?.text ?? null,
          summaryState: "idle",
          manualSite: siteCache.get(project.id) ?? null,
          editingSite: false,
          siteDraft: "",
          meta: meta ? { ...meta } : {},
          editingGroup: false,
          groupDraft: "",
          icon: known?.icon ?? null,
          iconColor: known?.color ?? null
        };
      });
      render();
      await Promise.all(state.cards.map((card) => loadProject(card)));
      scheduleRender();
      void loadInbox();
      if (state.tab === "spend") void loadSpendBoard();
    } catch (error) {
      const code = errorCode(error);
      if (code === "NOT_GRANTED") {
        showNotice("Project Atlas needs the \u201Csessions\u201D permission. Re-approve it in Settings \u2192 Extensions.", true);
      } else {
        showNotice(`Could not read projects: ${messageOf(error)}`, true);
      }
    }
  }
  async function loadProjectIcons() {
    try {
      const response = await host.serviceRequest({ method: "GET", path: "/projects" });
      if (response.status !== 200) return;
      const data = JSON.parse(response.body);
      for (const item of data.projects ?? []) {
        if (!item) continue;
        const value = { icon: item.icon ?? null, color: item.color ?? null };
        if (typeof item.id === "string") iconIndex.set(item.id, value);
        if (typeof item.directory === "string") iconIndex.set(normDir(item.directory), value);
      }
    } catch {
    }
  }
  function normDir(dir) {
    return dir.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }
  async function loadProject(card) {
    const [sessions, worktrees] = await Promise.all([
      host.listSessions(card.project.id).catch(() => null),
      host.listWorktrees(card.project.id).catch(() => null)
    ]);
    if (sessions) {
      const live = sessions.sessions.filter((session) => !session.archivedAt && !session.parentId);
      card.sessions = live;
      card.chats = live.length;
      card.last = live.reduce(
        (best, session) => !best || session.updatedAt > best.updatedAt ? session : best,
        null
      );
    }
    if (worktrees) card.worktrees = worktrees.worktrees.length;
    scheduleRender();
    await loadVitals(card, false);
  }
  async function loadVitals(card, force) {
    try {
      const query = { directory: card.project.directory };
      if (force) query.force = "1";
      if (card.manualSite) query.site = card.manualSite;
      const response = await host.serviceRequest({ method: "GET", path: "/vitals", query });
      if (response.status !== 200) throw new Error(`service answered ${response.status}`);
      card.vitals = JSON.parse(response.body);
      card.vitalsError = null;
      state.serviceDown = false;
      hideNotice();
      if (!card.icon) {
        const known = iconIndex.get(card.project.id) ?? iconIndex.get(normDir(card.project.directory));
        card.icon = known?.icon ?? card.vitals.iconUrl ?? null;
        card.iconColor = card.iconColor ?? known?.color ?? null;
      }
      ensureSizePolling();
      maybeSummarize(card);
      scheduleRender();
      void recordProbes(card);
    } catch (error) {
      const code = errorCode(error);
      if (code === "NO_SERVICE" || code === "SERVICE_FAILED") {
        state.serviceDown = true;
        showNotice(
          "The local service is not running. Approve \u201CProject Atlas\u201D in Settings \u2192 Extensions, then retry.",
          true,
          "Retry",
          () => {
            state.cards.forEach((item) => void loadVitals(item, false));
          }
        );
      } else {
        card.vitalsError = code === "NOT_GRANTED" ? "service not approved" : messageOf(error);
      }
      scheduleRender();
    }
  }
  function ensureSizePolling() {
    const pending = state.cards.some((card) => card.vitals && card.vitals.size.state !== "ready");
    if (!pending) {
      if (state.sizeTimer) {
        clearInterval(state.sizeTimer);
        state.sizeTimer = 0;
      }
      return;
    }
    if (state.sizeTimer) return;
    state.sizePolls = 0;
    state.sizeTimer = setInterval(() => void pollSizes(), 1800);
  }
  async function pollSizes() {
    state.sizePolls += 1;
    const pending = state.cards.filter((card) => card.vitals && card.vitals.size.state !== "ready");
    if (!pending.length || state.sizePolls > 133) {
      if (state.sizeTimer) {
        clearInterval(state.sizeTimer);
        state.sizeTimer = 0;
      }
      return;
    }
    await Promise.all(
      pending.map(async (card) => {
        try {
          const response = await host.serviceRequest({
            method: "GET",
            path: "/size",
            query: { directory: card.project.directory }
          });
          if (response.status === 200 && card.vitals) {
            card.vitals.size = JSON.parse(response.body);
          }
        } catch {
        }
      })
    );
    scheduleRender();
    ensureSizePolling();
  }
  function maybeSummarize(card) {
    if (!state.ai || card.summary || card.summaryState !== "idle") return;
    card.summaryState = "queued";
    summaryQueue.push(card);
    void pumpSummaries();
  }
  async function pumpSummaries() {
    if (summaryRunning) return;
    summaryRunning = true;
    while (summaryQueue.length) {
      const card = summaryQueue.shift();
      if (!state.ai) {
        card.summaryState = "idle";
        continue;
      }
      await writeSummary(card);
    }
    summaryRunning = false;
    scheduleRender();
  }
  async function writeSummary(card) {
    card.summaryState = "loading";
    scheduleRender();
    try {
      const response = await host.serviceRequest({
        method: "GET",
        path: "/readme",
        query: { directory: card.project.directory }
      });
      const readme = response.status === 200 ? JSON.parse(response.body) : { text: "", hash: "" };
      const cached = summaryCache.get(card.project.id);
      if (cached && cached.hash && cached.hash === readme.hash) {
        card.summary = cached.text;
        card.summaryState = "idle";
        return;
      }
      const stack = card.vitals?.stack ?? [];
      if (!readme.text && stack.length < 2) {
        card.summaryState = "idle";
        return;
      }
      const { text } = await host.generate({
        system: SYSTEM_PROMPT,
        prompt: buildPrompt(card, readme.text),
        maxOutputTokens: 160
      });
      const clean = String(text ?? "").trim().replace(/^["“]|["”]$/g, "").trim();
      if (!clean) throw new Error("empty summary");
      card.summary = clean;
      card.summaryState = "idle";
      if (readme.hash) {
        summaryCache.set(card.project.id, { text: clean, hash: readme.hash });
        await host.storage.set(`${SUMMARY_PREFIX}${card.project.id}`, { text: clean, hash: readme.hash, at: Date.now() }).catch(() => {
        });
      }
    } catch (error) {
      const code = errorCode(error);
      card.summaryState = "error";
      if (code === "NOT_GRANTED" || code === "NO_MODEL") {
        state.ai = false;
        aiEl.checked = false;
        showNotice(
          "Project Atlas cannot write blurbs: allow the \u201Cmodel\u201D permission, or pick a Small Model in Settings \u2192 Sessions.",
          false
        );
      }
    }
  }
  function buildPrompt(card, readme) {
    const lines = [
      `Project name: ${card.project.name}`,
      `Folder: ${card.project.directory}`,
      `Stack: ${(card.vitals?.stack ?? []).join(", ") || "unknown"}`
    ];
    if (card.vitals?.site) lines.push(`Live site: ${card.vitals.site}`);
    if (card.vitals?.web) lines.push(`Repository: ${card.vitals.web}`);
    if (readme) lines.push("", "README:", readme.slice(0, 6e3));
    return lines.join("\n");
  }
  function findCard(id) {
    return id ? state.cards.find((card) => card.project.id === id) : void 0;
  }
  gridEl.addEventListener("click", (event) => {
    const el2 = event.target;
    const opener = el2.closest("[data-open-project]");
    if (opener && !opener.closest(".card")) {
      const card2 = findCard(opener.dataset.openProject);
      if (card2) openDetail(card2);
      return;
    }
    const target = el2.closest("[data-act]");
    if (!target) return;
    if (target.dataset.act === "collapse") {
      const key = target.dataset.section ?? "";
      state.collapsed[key] = !state.collapsed[key];
      if (!state.collapsed[key]) delete state.collapsed[key];
      void saveSettings();
      render();
      return;
    }
    const rangeMatch = /^range-(\d+)$/.exec(target.dataset.act ?? "");
    if (rangeMatch) {
      state.range = Number(rangeMatch[1]) || 30;
      if (state.view === "project") {
        const rangeCard = findCard(
          target.closest(".card")?.dataset.id ?? state.viewId ?? void 0
        );
        state.activity = null;
        state.activityState = "idle";
        render();
        if (rangeCard) {
          void loadActivity(rangeCard, state.range);
          void loadSpend(rangeCard, state.range);
        }
      } else {
        if (state.tab === "spend") void loadSpendBoard();
        render();
      }
      return;
    }
    if (target.dataset.act === "inbox-group") {
      state.inboxGroup = !state.inboxGroup;
      render();
      return;
    }
    if (target.dataset.act === "inbox-more") {
      state.inboxLimit += 150;
      render();
      return;
    }
    const inboxKindMatch = /^inbox-kind-(all|todo|step)$/.exec(target.dataset.act ?? "");
    if (inboxKindMatch) {
      state.inboxKind = inboxKindMatch[1];
      state.inboxLimit = 150;
      render();
      return;
    }
    const id = target.closest(".card")?.dataset.id ?? (state.view === "project" ? state.viewId ?? void 0 : void 0);
    const card = findCard(id);
    if (!card) return;
    if (target.dataset.act === "deploy") {
      const url = target.dataset.url;
      if (url) void openLink(url);
      return;
    }
    if (target.dataset.act === "reveal-path" || target.dataset.act === "copy-rel") {
      const rel = target.dataset.rel ?? "";
      if (!rel) return;
      if (target.dataset.act === "copy-rel") {
        void host.writeClipboard(joinDiskPath(card.project.directory, rel)).then(() => toast("success", "Path copied")).catch(() => {
        });
      } else {
        void revealDiskPath(card, rel);
      }
      return;
    }
    void runAction(card, target.dataset.act ?? "");
  });
  gridEl.addEventListener("change", (event) => {
    const select = event.target;
    if (select.matches("[data-inbox-project]")) {
      state.inboxProject = select.value;
      state.inboxLimit = 150;
      render();
      return;
    }
    if (select.matches("[data-inbox-sort]")) {
      state.inboxSort = select.value;
      render();
    }
  });
  gridEl.addEventListener("input", (event) => {
    const input = event.target;
    if (input.matches("[data-site-input]")) {
      const card = findCard(input.dataset.siteInput);
      if (card) card.siteDraft = input.value;
      return;
    }
    if (input.matches("[data-group-input]")) {
      const card = findCard(input.dataset.groupInput);
      if (card) card.groupDraft = input.value;
    }
  });
  async function saveSettings() {
    const settings = {
      ai: state.ai,
      groupOn: state.groupOn,
      collapsed: state.collapsed,
      showHidden: state.showHidden,
      density: state.density,
      view: state.tab
    };
    await host.storage.set(SETTINGS_KEY, settings).catch(() => {
    });
  }
  async function persistMeta(card) {
    const group = card.meta.group?.trim() ? card.meta.group.trim() : null;
    card.meta.group = group;
    const empty = !card.meta.pinned && !group && !card.meta.hidden;
    metaCache.set(card.project.id, { ...card.meta });
    if (empty) {
      metaCache.delete(card.project.id);
      await host.storage.delete(`${META_PREFIX}${card.project.id}`).catch(() => {
      });
    } else {
      await host.storage.set(`${META_PREFIX}${card.project.id}`, { pinned: card.meta.pinned ?? false, group, hidden: card.meta.hidden ?? false }).catch(() => {
      });
    }
  }
  async function saveGroup(card) {
    card.meta.group = card.groupDraft.trim() || null;
    card.editingGroup = false;
    await persistMeta(card);
    render();
  }
  function openDetail(card) {
    state.view = "project";
    state.viewId = card.project.id;
    state.range = 30;
    state.activity = null;
    state.activityState = "idle";
    state.activityFor = null;
    state.git = null;
    state.gitState = "idle";
    state.gitFor = null;
    state.spend = null;
    state.spendState = "idle";
    state.spendFor = null;
    state.disk = null;
    state.diskState = "idle";
    state.diskFor = null;
    render();
    void loadActivity(card, 30);
    void loadGit(card);
    void loadSpend(card, 30);
    void loadDisk(card);
  }
  async function runAction(card, act) {
    switch (act) {
      case "detail":
        return openDetail(card);
      case "back":
        state.view = "board";
        state.viewId = null;
        render();
        return;
      case "open":
        return openProject(card);
      case "new":
        return newChat(card);
      case "folder":
        return revealFolder(card);
      case "files":
        return openSurface("files");
      case "git":
        return openSurface("git");
      case "github":
        if (card.vitals?.web) await openLink(card.vitals.web);
        return;
      case "copy":
        await host.writeClipboard(card.project.directory).catch(() => {
        });
        toast("success", "Folder path copied");
        return;
      case "edit-site":
        card.editingSite = true;
        card.editingGroup = false;
        card.siteDraft = card.manualSite ?? "";
        render();
        return;
      case "cancel-site":
        card.editingSite = false;
        render();
        return;
      case "save-site":
        return saveSite(card);
      case "pin":
        card.meta.pinned = !card.meta.pinned;
        await persistMeta(card);
        render();
        return;
      case "hide":
        card.meta.hidden = true;
        await persistMeta(card);
        render();
        return;
      case "unhide":
        card.meta.hidden = false;
        await persistMeta(card);
        render();
        return;
      case "edit-group":
        card.editingGroup = true;
        card.editingSite = false;
        card.groupDraft = card.meta.group ?? "";
        render();
        return;
      case "cancel-group":
        card.editingGroup = false;
        render();
        return;
      case "save-group":
        return saveGroup(card);
      case "check-now":
        toast("info", "Re-checking deployments\u2026");
        await loadVitals(card, true);
        render();
        return;
      case "rewrite": {
        card.summary = null;
        card.summaryState = "idle";
        summaryCache.delete(card.project.id);
        scheduleRender();
        summaryQueue.push(card);
        void pumpSummaries();
        return;
      }
    }
  }
  async function openProject(card) {
    try {
      if (card.last) {
        await host.openSession(card.last.id);
        return;
      }
      await host.startSession({
        providerId: "project-atlas",
        id: card.project.id,
        title: card.project.name,
        url: fileUrl(card.project.directory),
        projectId: card.project.id,
        navigation: "open",
        text: `Give me a tour of this project (${card.project.directory}): what it does and how it is built.`
      });
    } catch (error) {
      toast("error", messageOf(error));
    }
  }
  async function newChat(card) {
    try {
      await host.startSession({
        providerId: "project-atlas",
        id: card.project.id,
        title: card.project.name,
        url: fileUrl(card.project.directory),
        projectId: card.project.id,
        navigation: "open",
        text: `Explain the architecture of this project (${card.project.directory}).`
      });
    } catch (error) {
      toast("error", messageOf(error));
    }
  }
  async function revealFolder(card) {
    try {
      const response = await host.serviceRequest({
        method: "POST",
        path: "/reveal",
        body: JSON.stringify({ directory: card.project.directory })
      });
      if (response.status === 200) toast("success", "Opened in the file manager");
      else toast("error", "Could not open the folder");
    } catch (error) {
      toast("error", messageOf(error));
    }
  }
  async function openSurface(id) {
    try {
      await host.openSurface(id);
    } catch (error) {
      const code = errorCode(error);
      toast("error", code === "UNSUPPORTED" ? "This screen is not available here" : messageOf(error));
    }
  }
  async function openLink(url) {
    try {
      await host.openUrl(url);
    } catch (error) {
      toast("error", messageOf(error));
    }
  }
  async function saveSite(card) {
    const raw = card.siteDraft.trim();
    card.editingSite = false;
    if (!raw) {
      siteCache.delete(card.project.id);
      card.manualSite = null;
      await host.storage.delete(`${SITE_PREFIX}${card.project.id}`).catch(() => {
      });
      render();
      void loadVitals(card, false);
      return;
    }
    let value = raw;
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    try {
      const parsed = new URL(value);
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes(".")) throw new Error("bad url");
      value = parsed.toString().replace(/\/$/, "");
    } catch {
      toast("error", "That does not look like a web address");
      card.editingSite = true;
      render();
      return;
    }
    siteCache.set(card.project.id, value);
    card.manualSite = value;
    await host.storage.set(`${SITE_PREFIX}${card.project.id}`, { site: value }).catch(() => {
    });
    render();
    void loadVitals(card, false);
  }
  function activityState(last) {
    if (!last) return "none";
    if (last.activity === "running" || last.activity === "retrying") return "running";
    if (last.activity === "waiting-permission" || last.activity === "waiting-question") return "waiting";
    if (last.unread) return "unread";
    if (last.activity === "idle") return "idle";
    return "none";
  }
  function activityTitle(last) {
    if (!last) return "No chats yet";
    if (last.activity === "waiting-permission") return "Waiting for your permission";
    if (last.activity === "waiting-question") return "Waiting for your answer";
    if (last.activity === "running") return "Agent is working";
    if (last.activity === "retrying") return "Retrying";
    if (last.unread) return "Unread reply";
    return last.title;
  }
  function ago(timestamp) {
    if (!timestamp) return "";
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 6e4));
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d`;
    const weeks = Math.round(days / 7);
    if (weeks < 9) return `${weeks}w`;
    return `${Math.round(days / 30)}mo`;
  }
  function sizeLabel(card) {
    const size = card.vitals?.size;
    if (!size || size.state === "none") return "size \u2014";
    if (size.state === "running") return size.bytes != null ? `${bytes(size.bytes)}\u2026` : "measuring\u2026";
    if (size.bytes == null) return "size \u2014";
    return `${bytes(size.bytes)}${size.truncated ? "+" : ""}`;
  }
  function bytes(value) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let index = 0;
    let size = value;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index += 1;
    }
    return `${size >= 10 || index === 0 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
  }
  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  function fileUrl(directory) {
    return `file:///${directory.replace(/\\/g, "/").replace(/^\/+/, "")}`;
  }
  function errorCode(error) {
    return error instanceof HostRequestError ? error.code : "";
  }
  function messageOf(error) {
    if (error instanceof HostRequestError) return `${error.code}: ${error.message}`;
    return error instanceof Error ? error.message : String(error);
  }
  function toast(kind, message) {
    void host.toast({ kind, message }).catch(() => {
    });
  }
  function showNotice(text, error = false, actionLabel, action) {
    noticeEl.replaceChildren(document.createTextNode(text));
    noticeEl.className = `notice show${error ? " error" : ""}`;
    if (actionLabel && action) {
      const button2 = document.createElement("button");
      button2.textContent = actionLabel;
      button2.addEventListener("click", action);
      noticeEl.append(button2);
    }
  }
  function hideNotice() {
    if (!state.serviceDown) noticeEl.className = "notice";
  }
  searchEl.addEventListener("input", () => {
    state.query = searchEl.value;
    scheduleRender();
  });
  sortEl.addEventListener("change", () => {
    state.sort = sortEl.value;
    scheduleRender();
  });
  aiEl.addEventListener("change", () => {
    state.ai = aiEl.checked;
    void saveSettings();
    if (state.ai) {
      for (const card of state.cards) maybeSummarize(card);
    } else {
      summaryQueue.length = 0;
    }
    scheduleRender();
  });
  groupEl.addEventListener("click", () => {
    state.groupOn = !state.groupOn;
    void saveSettings();
    render();
  });
  hiddenEl.addEventListener("click", () => {
    state.showHidden = !state.showHidden;
    void saveSettings();
    render();
  });
  for (const tab of tabEls) {
    tab.addEventListener("click", () => {
      const next = tab.dataset.tab;
      if (next === state.tab) return;
      state.tab = next;
      state.view = "board";
      state.viewId = null;
      void saveSettings();
      render();
      if (next === "inbox" && state.inboxState === "idle") void loadInbox();
      if (next === "spend" && state.spendBoardState === "idle") void loadSpendBoard();
    });
  }
  for (const button2 of densityEls) {
    button2.addEventListener("click", () => {
      const next = button2.dataset.density;
      if (next === state.density) return;
      state.density = next;
      void saveSettings();
      render();
    });
  }
  refreshEl.addEventListener("click", () => {
    refreshEl.disabled = true;
    void Promise.all(state.cards.map((card) => loadVitals(card, true))).finally(() => {
      refreshEl.disabled = false;
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && document.activeElement !== searchEl) {
      event.preventDefault();
      searchEl.focus();
    }
  });
  var mounted = false;
  host.onReady((ctx) => {
    applyHostReady(ctx, document.documentElement);
    state.directory = ctx.directory;
    state.surface = ctx.surface;
    document.body.dataset.surface = ctx.surface;
    if (mounted) {
      scheduleRender();
      return;
    }
    mounted = true;
    void boot();
  });
  host.onDirectory((directory) => {
    state.directory = directory;
    scheduleRender();
  });
})();
