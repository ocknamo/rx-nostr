import { WS } from "jest-websocket-mock";

import {
  createRxBackwardReq,
  createRxForwardReq,
  createRxNostr,
  createRxOneshotReq,
  RxNostr,
} from "../index.js";
import { createMockRelay, expectReceiveMessage } from "./mock-relay.js";
import { asArray, sync } from "./test-helper.js";

describe("Single relay case", () => {
  const RELAY_URL = "ws://localhost:1234";
  let rxNostr: RxNostr;
  let relay: WS;

  beforeEach(async () => {
    relay = createMockRelay(RELAY_URL);

    rxNostr = createRxNostr();
    rxNostr.setRelays([RELAY_URL]);
    await relay.connected;
  });

  afterEach(() => {
    rxNostr.dispose();
    relay.close();
  });

  test("[backward] After receiving EOSE, CLOSE is sent out.", async () => {
    const req = createRxBackwardReq("sub");
    rxNostr.use(req).subscribe();

    const [eoseSync, resolveEose] = sync();
    rxNostr.createAllMessageObservable().subscribe(({ message }) => {
      if (message[0] === "EOSE") {
        resolveEose();
      }
    });

    req.emit([{ kinds: [0], limit: 5 }]);
    await expectReceiveMessage(relay, [
      "REQ",
      "sub:0",
      { kinds: [0], limit: 5 },
    ]);
    await eoseSync;
    await expectReceiveMessage(relay, ["CLOSE", "sub:0"]);
  });

  test("[backward] Receipt of EOSE does not terminate the Observable.", async () => {
    const req = createRxBackwardReq("sub");

    let completed = false;
    rxNostr.use(req).subscribe({
      complete() {
        completed = true;
      },
    });

    const [eoseSync, resolveEose] = sync();
    rxNostr.createAllMessageObservable().subscribe(({ message }) => {
      if (message[0] === "EOSE") {
        resolveEose();
      }
    });

    req.emit([{ kinds: [0], limit: 5 }]);
    await eoseSync;
    expect(completed).toBe(false);
  });

  test("[backward] Each EOSE CLOSEs the REQ in the order of arrival.", async () => {
    const req = createRxBackwardReq("sub");
    rxNostr.use(req).subscribe();

    // Relay mock returns messages at equal intervals,
    // so the REQs with the smallest limit should be CLOSE'd in turn.
    req.emit([{ kinds: [0], limit: 3 }]);
    req.emit([{ kinds: [0], limit: 2 }]);
    req.emit([{ kinds: [0], limit: 1 }]);

    await expectReceiveMessage(relay, [
      "REQ",
      "sub:0",
      { kinds: [0], limit: 3 },
    ]);
    await expectReceiveMessage(relay, [
      "REQ",
      "sub:1",
      { kinds: [0], limit: 2 },
    ]);
    await expectReceiveMessage(relay, [
      "REQ",
      "sub:2",
      { kinds: [0], limit: 1 },
    ]);
    await expectReceiveMessage(relay, ["CLOSE", "sub:2"]);
    await expectReceiveMessage(relay, ["CLOSE", "sub:1"]);
    await expectReceiveMessage(relay, ["CLOSE", "sub:0"]);
  });

  test("[forward] Each REQ is published with the same subId.", async () => {
    const req = createRxForwardReq("sub");
    const sub = rxNostr.use(req).subscribe();

    req.emit([{ kinds: [0], limit: 1 }]);
    req.emit([{ kinds: [0], limit: 2 }]);
    req.emit([{ kinds: [0], limit: 3 }]);
    sub.unsubscribe();

    await expectReceiveMessage(relay, [
      "REQ",
      "sub:0",
      { kinds: [0], limit: 1 },
    ]);
    await expectReceiveMessage(relay, [
      "REQ",
      "sub:0",
      { kinds: [0], limit: 2 },
    ]);
    await expectReceiveMessage(relay, [
      "REQ",
      "sub:0",
      { kinds: [0], limit: 3 },
    ]);
    await expectReceiveMessage(relay, ["CLOSE", "sub:0"]);
  });

  test("[oneshot] Receipt of EOSE terminates the Observable.", async () => {
    const req = createRxOneshotReq({
      subId: "sub",
      filters: [{ kinds: [0], limit: 5 }],
    });

    let completed = false;
    rxNostr.use(req).subscribe({
      complete() {
        completed = true;
      },
    });

    const [eoseSync, resolveEose] = sync();
    rxNostr.createAllMessageObservable().subscribe(({ message }) => {
      if (message[0] === "EOSE") {
        resolveEose();
      }
    });

    await eoseSync;
    expect(completed).toBe(true);
  });
});

describe("Slow relay and fast relay case", () => {
  const RELAY_URL1 = "ws://localhost:1234";
  const RELAY_URL2 = "ws://localhost:1235";
  let rxNostr: RxNostr;
  let relay1: WS;
  let relay2: WS;

  beforeEach(async () => {
    relay1 = createMockRelay(RELAY_URL1, 10);
    relay2 = createMockRelay(RELAY_URL2, 100);

    rxNostr = createRxNostr();
    rxNostr.setRelays([RELAY_URL1, RELAY_URL2]);
    await relay1.connected;
    await relay2.connected;
  });

  afterEach(() => {
    rxNostr.dispose();
    relay1.close();
    relay2.close();
  });

  test("[oneshot] Collect all events under different timing EOSE.", async () => {
    const req = createRxOneshotReq({
      subId: "sub",
      filters: [{ kinds: [0], limit: 3 }],
    });

    const result = await asArray(rxNostr.use(req));
    expect(result.length).toBe(6);
  });
});
