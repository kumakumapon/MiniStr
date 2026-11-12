import { handleFourArmyCpuRequest } from '../ai/fourArmyCpuProtocol';

// No DOM, storage, full match state, other-army funds or real RNG enter this Worker.
self.onmessage = (event: MessageEvent<unknown>) => {
  self.postMessage(handleFourArmyCpuRequest(event.data) ?? { protocol: 1, kind: 'invalid' });
};
