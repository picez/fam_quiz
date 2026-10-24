// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicQuestion } from '@quiz/shared';
import { AnswerInput } from './AnswerInput';

afterEach(cleanup);

const cities = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
  { id: 'c', text: 'Одеса' },
];

const question = (over: Partial<PublicQuestion>): PublicQuestion => ({
  type: 'single',
  text: 'Запитання',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  choices: cities,
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, audio: null, reveal: null,
  ...over,
});

function setup(over: Partial<PublicQuestion>) {
  const onSubmit = vi.fn();
  render(<AnswerInput question={question(over)} onSubmit={onSubmit} />);
  return onSubmit;
}

const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('AnswerInput', () => {
  it('removed options are struck through with «прибрано» and keep their place', () => {
    const single4q = question({ choices: [...cities, { id: 'd', text: 'Харків' }] });
    render(<AnswerInput question={single4q} removed={['a', 'c']} onSubmit={() => {}} />);
    const removed = screen.getAllByRole('button').filter((button) => button.classList.contains('is-removed'));
    expect(removed).toHaveLength(2);
    for (const button of removed) {
      expect(button).toHaveProperty('disabled', true);
      expect(within(button).getByText('прибрано')).toBeTruthy();
    }
    expect(screen.getAllByRole('button').map((button) => button.textContent?.replace('прибрано', ''))).toEqual(['AЛьвів', 'BКиїв', 'CОдеса', 'DХарків']);
  });

  it('the order input shows what goes on top and at the bottom', () => {
    const { container } = render(<AnswerInput question={question({ type: 'order', orderLabels: { top: 'Захід', bottom: 'Схід' } })} onSubmit={vi.fn()} />);
    const list = container.querySelector('ol.order') as HTMLElement;
    const top = screen.getByText(/Захід/);
    const bottom = screen.getByText(/Схід/);
    expect(top.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    cleanup();
    const plain = render(<AnswerInput question={question({ type: 'order', orderLabels: { top: '', bottom: '' } })} onSubmit={vi.fn()} />);
    expect(plain.container.querySelector('.order-label')).toBeNull();
  });

  it('single: sends the tapped option at once', () => {
    const onSubmit = setup({ type: 'single' });
    fireEvent.click(button(/Київ/));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'b' });
  });

  it('labels options with letters', () => {
    setup({ type: 'single' });
    expect(button(/Львів/).textContent).toContain('A');
    expect(button(/Одеса/).textContent).toContain('C');
  });

  it('picture options show thumbnails with letters and still answer by id', () => {
    const pic = '/uploads/abcdefabcdefabcd.png';
    const onSubmit = vi.fn();
    const choices = [{ id: 'a', text: 'Львів' }, { id: 'b', text: '', imageUrl: pic }, { id: 'c', text: 'Одеса', imageUrl: pic }];
    const { container } = render(<AnswerInput question={question({ type: 'single', choices })} onSubmit={onSubmit} />);
    expect(container.querySelector('.choices')?.className).toContain('has-images');
    const image = screen.getByAltText('Картинка B') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(pic);
    const pictured = image.closest('button') as HTMLButtonElement;
    expect(pictured.querySelector('.letter')?.textContent).toBe('B');
    expect(screen.getByAltText('Одеса')).toBeTruthy();
    fireEvent.click(pictured);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'b' });
    cleanup();
    expect(render(<AnswerInput question={question({ type: 'single' })} onSubmit={vi.fn()} />).container.querySelector('.choices')?.className).toBe('choices');
  });

  it('a picture that fails to load turns into its letter label', () => {
    render(<AnswerInput question={question({ type: 'single', choices: [{ id: 'a', text: 'Львів' }, { id: 'b', text: '', imageUrl: '/uploads/abcdefabcdefabcd.png' }] })} onSubmit={vi.fn()} />);
    fireEvent.error(screen.getByAltText('Картинка B'));
    expect(screen.queryByRole('img')).toBeNull();
    expect(button(/Картинка B/)).toBeTruthy();
  });

  it('multi: sends the selected options after confirmation', () => {
    const onSubmit = setup({ type: 'multi' });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.click(button(/Львів/));
    fireEvent.click(button(/Одеса/));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'multi', optionIds: ['a', 'c'] });
  });

  it('boolean: sends yes or no', () => {
    const onSubmit = setup({ type: 'boolean', choices: [] });
    fireEvent.click(button('Ні'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'boolean', value: false });
  });

  it('text: sends the trimmed text and refuses an empty one', () => {
    const onSubmit = setup({ type: 'text', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: '   ' } });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: '  Одеса ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'text', value: 'Одеса' });
  });

  it('clues: the typed answer goes out as a «Who am I?» answer', () => {
    const onSubmit = setup({ type: 'clues', choices: [], clues: { total: 5, shown: ['Народився 1814 року'], nextAt: null, byHost: false, intervalSeconds: 8 } });
    fireEvent.change(screen.getByLabelText('Ваша відповідь'), { target: { value: ' Шевченко ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'clues', value: 'Шевченко' });
  });

  it('pin: the map frame with zoom buttons; the answer goes out once a pin is placed', () => {
    const onSubmit = setup({ type: 'pin', choices: [], pin: { map: 'europe', aspect: 4 / 3 } });
    expect(screen.getByRole('group', { name: 'Мапа: торкнися, щоб поставити точку' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Наблизити' })).toBeTruthy();
    expect(button('Відповісти').disabled).toBe(true);
    expect(document.querySelector('img.pin-base')!.getAttribute('src')).toBe('/maps/europe.svg');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('numeric: accepts a decimal comma and refuses text', () => {
    const onSubmit = setup({ type: 'numeric', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');

    fireEvent.change(input, { target: { value: 'багато' } });
    expect(button('Відповісти').disabled).toBe(true);

    fireEvent.change(input, { target: { value: ' 2061,5 ' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'numeric', value: 2061.5 });
  });

  it('numeric: accepts a negative number and refuses an empty field', () => {
    const onSubmit = setup({ type: 'numeric', choices: [] });
    const input = screen.getByLabelText('Ваша відповідь');
    expect(button('Відповісти').disabled).toBe(true);
    fireEvent.change(input, { target: { value: '-12' } });
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'numeric', value: -12 });
  });

  it('order: sends the items in the order the player arranged', () => {
    const onSubmit = setup({ type: 'order' });
    fireEvent.click(button('Перемістити вниз: Львів'));
    fireEvent.click(button('Перемістити вгору: Одеса'));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'order', itemIds: ['b', 'c', 'a'] });
  });

  it('order: cannot move the first item up or the last item down', () => {
    setup({ type: 'order' });
    expect(button('Перемістити вгору: Львів').disabled).toBe(true);
    expect(button('Перемістити вниз: Одеса').disabled).toBe(true);
  });

  describe('match', () => {
    const right = [
      { id: 'z', text: 'Уж' },
      { id: 'x', text: 'Дніпро' },
      { id: 'y', text: 'Полтва' },
    ];
    const left = [
      { id: 'a', text: 'Київ' },
      { id: 'b', text: 'Львів' },
      { id: 'c', text: 'Ужгород' },
    ];
    const matchSetup = (over: Partial<PublicQuestion> = {}) => setup({ type: 'match', choices: left, right, ...over });
    const connect = (l: string, r: string) => {
      fireEvent.click(button(new RegExp(`^${l}\\d*$`)));
      fireEvent.click(button(new RegExp(`^${r}\\d*$`)));
    };
    const linked = (name: string) => button(new RegExp(`^${name}\\d*$`)).className.includes('is-linked');

    it('connects left then right and sends all links when everything is connected', () => {
      const onSubmit = matchSetup();
      expect(button('Відповісти').disabled).toBe(true);
      connect('Київ', 'Дніпро');
      connect('Львів', 'Полтва');
      expect(button('Відповісти').disabled).toBe(true);
      connect('Ужгород', 'Уж');
      expect(button('Відповісти').disabled).toBe(false);
      fireEvent.click(button('Відповісти'));
      expect(onSubmit).toHaveBeenCalledWith({
        type: 'match',
        links: [
          { left: 'a', right: 'x' },
          { left: 'b', right: 'y' },
          { left: 'c', right: 'z' },
        ],
      });
    });

    it('tapping a connected item removes the link', () => {
      matchSetup();
      connect('Київ', 'Дніпро');
      fireEvent.click(button(/^Дніпро/));
      expect(linked('Київ')).toBe(false);
      expect(linked('Дніпро')).toBe(false);
      connect('Київ', 'Дніпро');
      fireEvent.click(button(/^Київ/));
      expect(linked('Київ')).toBe(false);
      expect(linked('Дніпро')).toBe(false);
      expect(button('Відповісти').disabled).toBe(true);
    });

    it('a right tap without a picked left does nothing and a second left moves the pick', () => {
      matchSetup();
      fireEvent.click(button(/^Уж$/));
      expect(document.querySelector('.is-linked')).toBeNull();
      fireEvent.click(button(/^Київ/));
      fireEvent.click(button(/^Львів/));
      expect(button(/^Київ/).getAttribute('aria-pressed')).toBe('false');
      expect(button(/^Львів/).getAttribute('aria-pressed')).toBe('true');
    });

    it('links by id when two right items have the same text', () => {
      const onSubmit = matchSetup({
        right: [
          { id: 'x', text: '1991' },
          { id: 'y', text: '1991' },
          { id: 'z', text: 'Уж' },
        ],
      });
      fireEvent.click(button(/^Київ/));
      fireEvent.click(screen.getAllByRole('button', { name: /^1991/ })[0]);
      connect('Львів', 'Уж');
      fireEvent.click(button(/^Ужгород/));
      fireEvent.click(screen.getAllByRole('button', { name: /^1991/ })[1]);
      fireEvent.click(button('Відповісти'));
      const links = onSubmit.mock.calls[0][0].links;
      expect(links).toContainEqual({ left: 'a', right: 'x' });
      expect(links).toContainEqual({ left: 'c', right: 'y' });
    });

    it('shows the pair number on both connected items', () => {
      matchSetup();
      connect('Львів', 'Дніпро');
      expect(button(/^Львів/).querySelector('.match-badge')?.textContent).toBe('2');
      expect(button(/Дніпро/).querySelector('.match-badge')?.textContent).toBe('2');
    });
  });

  it('50/50 keeps removed options in place, faded and disabled', () => {
    const four = [...cities, { id: 'd', text: 'Харків' }];
    const onSubmit = vi.fn();
    const { container, unmount } = render(<AnswerInput question={question({ choices: four })} removed={['a', 'c']} onSubmit={onSubmit} />);
    const buttons = [...container.querySelectorAll('button.choice')] as HTMLButtonElement[];
    expect(buttons).toHaveLength(4);
    ['Львів', 'Київ', 'Одеса', 'Харків'].forEach((city, index) => expect(buttons[index].textContent).toContain(city));
    expect(buttons.map((b) => b.className.includes('is-removed'))).toEqual([true, false, true, false]);
    expect(buttons.map((b) => b.disabled)).toEqual([true, false, true, false]);
    expect(buttons[0].getAttribute('aria-label')).toBe('Львів — прибрано');
    fireEvent.click(buttons[0]);
    fireEvent.click(button(/Київ/));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'single', optionId: 'b' });
    unmount();

    const multi = vi.fn();
    render(<AnswerInput question={question({ type: 'multi', choices: four })} removed={['a']} onSubmit={multi} />);
    fireEvent.click(screen.getByRole('button', { name: 'Львів — прибрано' }));
    fireEvent.click(button(/Київ/));
    fireEvent.click(button('Відповісти'));
    expect(multi).toHaveBeenCalledWith({ type: 'multi', optionIds: ['b'] });
  });

  it('an option picked before 50/50 removes it is dropped from the multi answer', () => {
    const four = [...cities, { id: 'd', text: 'Харків' }];
    const onSubmit = vi.fn();
    const { rerender } = render(<AnswerInput question={question({ type: 'multi', choices: four })} onSubmit={onSubmit} />);
    fireEvent.click(button(/Львів/));
    rerender(<AnswerInput question={question({ type: 'multi', choices: four })} removed={['a']} onSubmit={onSubmit} />);
    const lviv = screen.getByRole('button', { name: 'Львів — прибрано' });
    expect(lviv.getAttribute('aria-pressed')).toBe('false');
    expect(button('Відповісти').disabled).toBe(true);
    fireEvent.click(button(/Київ/));
    fireEvent.click(button('Відповісти'));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'multi', optionIds: ['b'] });
  });

  it('poll: a tap on an option sends it as a poll answer', () => {
    const season = [
      { id: 'a', text: 'Зима' },
      { id: 'b', text: 'Літо' },
    ];
    const onSubmit = setup({ type: 'poll', choices: season, points: 0 });
    fireEvent.click(button(/Літо/));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'poll', optionId: 'b' });
  });

  it('wordcloud: renders the word fields from the question', () => {
    setup({ type: 'wordcloud', choices: [], points: 0, cloud: { words: 2 } });
    expect(screen.getByLabelText('Слово 1')).toBeTruthy();
    fireEvent.click(button('＋ Ще слово'));
    expect(screen.getByLabelText('Слово 2')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '＋ Ще слово' })).toBeNull();
  });
});
