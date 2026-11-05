import { afterEach, describe, expect, it } from 'vitest';
import { withToken } from './api';

describe('withToken', () => {
  afterEach(() => localStorage.clear());

  it('menambahkan token, dengan pemisah yang benar dan aman untuk URL', () => {
    localStorage.setItem('token', 'a b');
    expect(withToken('/video/x.mp4')).toBe('/video/x.mp4?token=a%20b');
    expect(withToken('/zip?format=yolo')).toBe('/zip?format=yolo&token=a%20b');
  });

  it('tanpa token, URL tidak berubah', () => {
    expect(withToken('/video/x.mp4')).toBe('/video/x.mp4');
  });
});
