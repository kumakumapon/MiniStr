import { handleFourArmyFileRequest } from '../game/fourArmySpectatorProtocol';
self.onmessage = (event: MessageEvent<unknown>) => {
  const reply = handleFourArmyFileRequest(event.data);
  if (reply) self.postMessage(reply);
};
