import {isSelectorWithin, makeSelectorEmpty} from '../../../src/inject/dynamic-theme/selectors';

describe('Check if a selector is within another selector', () => {
    it('Treats identical selector as within', () => {
        expect(isSelectorWithin('.a', '.a')).toBe(true);
        expect(isSelectorWithin('.a:hover', '.a:hover')).toBe(true);
    });

    it('Returns false when sub does not start with parent', () => {
        expect(isSelectorWithin('.b', '.a')).toBe(false);
        expect(isSelectorWithin('.a', '.a .b')).toBe(false);
    });

    it('Returns false when sub continues the same token', () => {
        expect(isSelectorWithin('.ab', '.a')).toBe(false);
        expect(isSelectorWithin('dividend', 'div')).toBe(false);
    });

    it('Treats same-element extensions as within', () => {
        expect(isSelectorWithin('.a.b', '.a')).toBe(true);
        expect(isSelectorWithin('.a:hover', '.a')).toBe(true);
        expect(isSelectorWithin('.a::before', '.a')).toBe(true);
        expect(isSelectorWithin('.a::after', '.a')).toBe(true);
        expect(isSelectorWithin('.a:not(.x)', '.a')).toBe(true);
        expect(isSelectorWithin('.a#id', '.a')).toBe(true);
        expect(isSelectorWithin('.a[x]', '.a')).toBe(true);
        expect(isSelectorWithin('.a[x="y"]', '.a')).toBe(true);
    });

    it('Treats descendants as within', () => {
        expect(isSelectorWithin('.a .b', '.a')).toBe(true);
        expect(isSelectorWithin('.a .b .c', '.a')).toBe(true);
    });

    it('Treats immediate child as within', () => {
        expect(isSelectorWithin('.a > .b', '.a')).toBe(true);
        expect(isSelectorWithin('.a>.b', '.a')).toBe(true);
        expect(isSelectorWithin('.a >.b', '.a')).toBe(true);
        expect(isSelectorWithin('.a> .b', '.a')).toBe(true);
    });

    it('Treats siblings as not within', () => {
        expect(isSelectorWithin('.a + .b', '.a')).toBe(false);
        expect(isSelectorWithin('.a+.b', '.a')).toBe(false);
        expect(isSelectorWithin('.a ~ .b', '.a')).toBe(false);
        expect(isSelectorWithin('.a~.b', '.a')).toBe(false);
    });

    it('Handle complex selectors', () => {
        expect(isSelectorWithin('.a:hover .b', '.a')).toBe(true);
        expect(isSelectorWithin('.a .b > .c', '.a')).toBe(true);
        expect(isSelectorWithin('.a + .b .c', '.a')).toBe(false);
    });
});

describe('Make selector empty', () => {
    it('Should append :empty', () => {
        expect(makeSelectorEmpty('.a')).toBe('.a:empty');
        expect(makeSelectorEmpty('div.a')).toBe('div.a:empty');
        expect(makeSelectorEmpty('.a .b')).toBe('.a .b:empty');
    });

    it('Should ignore already :empty selectors', () => {
        expect(makeSelectorEmpty('.a:empty')).toBe('.a:empty');
    });

    it('Should treat :before and :after as empty', () => {
        expect(makeSelectorEmpty('.a:before')).toBe('.a:before');
        expect(makeSelectorEmpty('.a:after')).toBe('.a:after');
        expect(makeSelectorEmpty('.a::before')).toBe('.a::before');
        expect(makeSelectorEmpty('.a::after')).toBe('.a::after');
    });

    it('Should trim selectors', () => {
        expect(makeSelectorEmpty('  .a  ')).toBe('.a:empty');
    });
});
