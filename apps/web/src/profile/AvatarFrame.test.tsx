// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { PHOTO_FRAMES } from '@quiz/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { AvatarFrame } from './AvatarFrame';

afterEach(cleanup);

describe('AvatarFrame', () => {
  it('draws the tomoe ring without a chosen frame', () => {
    const { container } = render(
      <AvatarFrame frame={null}>
        <i className="kid" />
      </AvatarFrame>,
    );
    expect(container.querySelector('.tomoe-ring .kid')).toBeTruthy();
    expect(container.querySelector('.photo-frame')).toBeNull();
  });

  it.each(PHOTO_FRAMES)('draws %s around the children with decorative art only', (id) => {
    const { container } = render(
      <AvatarFrame frame={id}>
        <i className="kid" />
      </AvatarFrame>,
    );
    expect(container.querySelector(`.photo-frame.photo-frame-${id} .kid`)).toBeTruthy();
    expect(container.querySelector('.tomoe-ring')).toBeNull();
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('focusable')).toBe('false');
    }
  });

  it('uses svg art for the five illustrated frames only', () => {
    const withSvg = PHOTO_FRAMES.filter((id) => render(<AvatarFrame frame={id}>x</AvatarFrame>).container.querySelector('svg') !== null);
    cleanup();
    expect(withSvg).toEqual(['cloud', 'crows', 'thorns', 'eclipse', 'storm']);
  });
});
