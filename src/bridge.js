// @flow

import EventEmitter from 'events';

import type { ComponentFilter, Wall } from './types';
import type {
  InspectedElementPayload,
  OwnersList,
  ProfilingDataBackend,
  RendererID,
} from 'src/backend/types';
import type { StyleAndLayout as StyleAndLayoutPayload } from 'src/backend/NativeStyleEditor/types';

const BATCH_DURATION = 100;

type ElementAndRendererID = {| id: number, rendererID: RendererID |};

type Message = {|
  event: string,
  payload: any,
|};

type HighlightElementInDOM = {|
  ...ElementAndRendererID,
  displayName: string | null,
  hideAfterTimeout: boolean,
  openNativeElementsPanel: boolean,
  scrollIntoView: boolean,
|};

type OverrideValue = {|
  ...ElementAndRendererID,
  path: Array<string | number>,
  value: any,
|};

type OverrideHookState = {|
  ...OverrideValue,
  hookID: number,
|};

type OverrideSuspense = {|
  ...ElementAndRendererID,
  forceFallback: boolean,
|};

type InspectElementParams = {|
  ...ElementAndRendererID,
  path?: Array<string | number>,
|};

type NativeStyleEditor_RenameAttributeParams = {|
  ...ElementAndRendererID,
  oldName: string,
  newName: string,
  value: string,
|};

type NativeStyleEditor_SetValueParams = {|
  ...ElementAndRendererID,
  name: string,
  value: string,
|};

type BackendEvents = {|
  captureScreenshot: [{| commitIndex: number, rootID: number |}],
  inspectedElement: [InspectedElementPayload],
  isBackendStorageAPISupported: [boolean],
  operations: [Array<number>],
  ownersList: [OwnersList],
  overrideComponentFilters: [Array<ComponentFilter>],
  profilingData: [ProfilingDataBackend],
  profilingStatus: [boolean],
  reloadAppForProfiling: [],
  screenshotCaptured: [
    {| commitIndex: number, dataURL: string, rootID: number |},
  ],
  selectFiber: [number],
  shutdown: [],
  stopInspectingNative: [boolean],
  syncSelectionFromNativeElementsPanel: [],
  syncSelectionToNativeElementsPanel: [],

  // React Native style editor plug-in.
  isNativeStyleEditorSupported: [
    {| isSupported: boolean, validAttributes: ?$ReadOnlyArray<string> |},
  ],
  NativeStyleEditor_styleAndLayout: [StyleAndLayoutPayload],
|};

type FrontendEvents = {|
  captureScreenshot: [{| commitIndex: number, rootID: number |}],
  clearNativeElementHighlight: [],
  getOwnersList: [ElementAndRendererID],
  getProfilingData: [{| rendererID: RendererID |}],
  getProfilingStatus: [],
  highlightNativeElement: [HighlightElementInDOM],
  inspectElement: [InspectElementParams],
  logElementToConsole: [ElementAndRendererID],
  overrideContext: [OverrideValue],
  overrideHookState: [OverrideHookState],
  overrideProps: [OverrideValue],
  overrideState: [OverrideValue],
  overrideSuspense: [OverrideSuspense],
  profilingData: [ProfilingDataBackend],
  reloadAndProfile: [boolean],
  selectElement: [ElementAndRendererID],
  selectFiber: [number],
  shutdown: [],
  startInspectingNative: [],
  startProfiling: [boolean],
  stopInspectingNative: [boolean],
  stopProfiling: [],
  updateAppendComponentStack: [boolean],
  updateComponentFilters: [Array<ComponentFilter>],
  viewElementSource: [ElementAndRendererID],

  // React Native style editor plug-in.
  NativeStyleEditor_measure: [ElementAndRendererID],
  NativeStyleEditor_renameAttribute: [NativeStyleEditor_RenameAttributeParams],
  NativeStyleEditor_setValue: [NativeStyleEditor_SetValueParams],
|};

class Bridge<
  OutgoingEvents: Object,
  IncomingEvents: Object
> extends EventEmitter<{|
  ...IncomingEvents,
  ...OutgoingEvents,
|}> {
  _isShutdown: boolean = false;
  _messageQueue: Array<any> = [];
  _timeoutID: TimeoutID | null = null;
  _wall: Wall;
  _wallUnlisten: Function | null = null;

  constructor(wall: Wall) {
    super();

    this._wall = wall;

    this._wallUnlisten =
      wall.listen((message: Message) => {
        (this: any).emit(message.event, message.payload);
      }) || null;
  }

  // Listening directly to the wall isn't advised.
  // It can be used to listen for legacy (v3) messages (since they use a different format).
  get wall(): Wall {
    return this._wall;
  }

  send<EventName: $Keys<OutgoingEvents>>(
    event: EventName,
    ...payload: $ElementType<OutgoingEvents, EventName>
  ) {
    if (this._isShutdown) {
      console.warn(
        `Cannot send message "${event}" through a Bridge that has been shutdown.`
      );
      return;
    }

    // When we receive a message:
    // - we add it to our queue of messages to be sent
    // - if there hasn't been a message recently, we set a timer for 0 ms in
    //   the future, allowing all messages created in the same tick to be sent
    //   together
    // - if there *has* been a message flushed in the last BATCH_DURATION ms
    //   (or we're waiting for our setTimeout-0 to fire), then _timeoutID will
    //   be set, and we'll simply add to the queue and wait for that
    this._messageQueue.push(event, payload);
    if (!this._timeoutID) {
      this._timeoutID = setTimeout(this._flush, 0);
    }
  }

  shutdown() {
    if (this._isShutdown) {
      console.warn('Bridge was already shutdown.');
      return;
    }

    // Queue the shutdown outgoing message for subscribers.
    this.send('shutdown');

    // Mark this bridge as destroyed, i.e. disable its public API.
    this._isShutdown = true;

    // Disable the API inherited from EventEmitter that can add more listeners and send more messages.
    // $FlowFixMe This property is not writable.
    this.addListener = function() {};
    // $FlowFixMe This property is not writable.
    this.emit = function() {};
    // NOTE: There's also EventEmitter API like `on` and `prependListener` that we didn't add to our Flow type of EventEmitter.

    // Unsubscribe this bridge incoming message listeners to be sure, and so they don't have to do that.
    this.removeAllListeners();

    // Stop accepting and emitting incoming messages from the wall.
    const wallUnlisten = this._wallUnlisten;
    if (wallUnlisten) {
      wallUnlisten();
    }

    // Synchronously flush all queued outgoing messages.
    // At this step the subscribers' code may run in this call stack.
    do {
      this._flush();
    } while (this._messageQueue.length);

    // Make sure once again that there is no dangling timer.
    clearTimeout(this._timeoutID);
    this._timeoutID = null;
  }

  _flush = () => {
    // This method is used after the bridge is marked as destroyed in shutdown sequence,
    // so we do not bail out if the bridge marked as destroyed.
    // It is a private method that the bridge ensures is only called at the right times.

    clearTimeout(this._timeoutID);
    this._timeoutID = null;

    if (this._messageQueue.length) {
      for (let i = 0; i < this._messageQueue.length; i += 2) {
        this._wall.send(this._messageQueue[i], ...this._messageQueue[i + 1]);
      }
      this._messageQueue.length = 0;

      // Check again for queued messages in BATCH_DURATION ms. This will keep
      // flushing in a loop as long as messages continue to be added. Once no
      // more are, the timer expires.
      this._timeoutID = setTimeout(this._flush, BATCH_DURATION);
    }
  };
}

export type BackendBridge = Bridge<BackendEvents, FrontendEvents>;
export type FrontendBridge = Bridge<FrontendEvents, BackendEvents>;

export default Bridge;
