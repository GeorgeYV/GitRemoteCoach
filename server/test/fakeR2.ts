import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Fake mínimo del S3Client de R2 para smoke tests sin red — implementa solo la superficie que
 * r2.ts usa (PutObjectCommand, DeleteObjectCommand). Mismo criterio que fakeStripe.ts.
 */
export interface FakeR2State {
  /** key -> bytes subidos, para poder assertEqual sobre lo que de verdad se "guardó". */
  objects: Map<string, Buffer>;
  deletedKeys: string[];
}

export function createFakeR2(): { client: S3Client; state: FakeR2State } {
  const state: FakeR2State = { objects: new Map(), deletedKeys: [] };

  const fake = {
    async send(command: unknown) {
      if (command instanceof PutObjectCommand) {
        const { Key, Body } = command.input;
        state.objects.set(Key as string, Buffer.from(Body as Buffer));
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        const { Key } = command.input;
        state.objects.delete(Key as string);
        state.deletedKeys.push(Key as string);
        return {};
      }
      throw new Error(`fakeR2: comando no soportado (${(command as { constructor: { name: string } }).constructor.name})`);
    },
  };

  return { client: fake as unknown as S3Client, state };
}
