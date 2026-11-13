import { handleFourArmyFileRequestAsync } from '../game/fourArmySpectatorProtocol';
self.onmessage = async (event: MessageEvent<unknown>) => {
  const reply = await handleFourArmyFileRequestAsync(
    event.data,
    () => true,
    (id, done, total) => self.postMessage({ id, kind: 'progress', done, total }),
  );
  if (reply) self.postMessage(reply);
};
