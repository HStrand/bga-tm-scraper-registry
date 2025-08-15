import '@testing-library/jest-dom';
import { beforeAll, vi } from 'vitest';

// Mock window.scrollY and window.scrollX
beforeAll(() => {
  Object.defineProperty(window, 'scrollY', {
    value: 0,
    writable: true,
  });
  
  Object.defineProperty(window, 'scrollX', {
    value: 0,
    writable: true,
  });

  // Mock getBoundingClientRect
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 200,
    height: 100,
    top: 100,
    left: 100,
    bottom: 200,
    right: 300,
    x: 100,
    y: 100,
    toJSON: vi.fn(),
  }));

  // Mock window dimensions
  Object.defineProperty(window, 'innerWidth', {
    value: 1024,
    writable: true,
  });
  
  Object.defineProperty(window, 'innerHeight', {
    value: 768,
    writable: true,
  });
});