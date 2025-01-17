import { firstValueFrom, Observable, toArray } from "rxjs";
import { TestScheduler } from "rxjs/testing";

export function asArray<T>(val$: Observable<T>): Promise<T[]> {
  return firstValueFrom(val$.pipe(toArray()));
}

export function sync<T = void>(): [
  Promise<T>,
  (val: T) => void,
  () => boolean
] {
  let resolved = false;
  let resolver: (val: T) => void = () => {
    throw new Error(`Call resolve before initializing resolver`);
  };

  const resolve = (val: T) => {
    resolved = true;
    resolver(val);
  };
  const promise = new Promise<T>((_resolver) => {
    resolver = _resolver;
  });
  const isResolved = () => resolved;

  return [promise, resolve, isResolved];
}

export function sleep(time: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, time);
  });
}

export function testScheduler() {
  return new TestScheduler((a, b) => expect(a).toEqual(b));
}
