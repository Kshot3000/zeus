jest.mock('mobx-react', () => ({
    inject: () => (component: any) => component,
    observer: (component: any) => component
}));
jest.mock('../../stores/Stores', () => ({
    unitsStore: { units: 'sats' },
    settingsStore: {
        settings: {
            fiat: 'USD',
            display: {
                showAllDecimalPlaces: false,
                removeDecimalSpaces: false
            }
        }
    },
    fiatStore: {
        fiatRates: [{ code: 'USD', rate: 50000 }],
        getSymbol: () => ({
            symbol: '$',
            space: false,
            rtl: false,
            separatorSwap: false,
            decimalPlaces: 2
        }),
        symbolLookup: () => ({ decimalPlaces: 2 })
    }
}));
jest.mock('../../utils/LocaleUtils', () => ({
    localeString: (key: string) => key
}));
jest.mock('../../utils/ThemeUtils', () => ({
    themeColor: () => '#000000'
}));
jest.mock('../../utils/LnurlPayUtils', () => ({
    verifyLnurlPayInvoice: jest.fn(),
    isLnurlCallbackAllowed: jest.fn()
}));
jest.mock('react-native-blob-util', () => ({ fetch: jest.fn() }));
jest.mock('react-native-gesture-handler', () => ({ ScrollView: 'ScrollView' }));
jest.mock('../../components/Amount', () => 'Amount');
jest.mock('../../components/AmountInput', () => 'AmountInput');
jest.mock('../../components/Button', () => 'Button');
jest.mock('../../components/Header', () => 'Header');
jest.mock('../../components/Screen', () => 'Screen');
jest.mock('../../components/TextInput', () => 'TextInput');
jest.mock('../../components/LoadingIndicator', () => 'LoadingIndicator');
jest.mock('../../components/layout/Row', () => ({ Row: 'Row' }));
jest.mock('./Metadata', () => 'LnurlPayMetadata');
jest.mock('../../models/Contact', () => class Contact {});

import * as React from 'react';
import { Alert } from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import LnurlPay from './LnurlPay';
import Amount from '../../components/Amount';
import AmountInput from '../../components/AmountInput';
import Button from '../../components/Button';
import { isLnurlCallbackAllowed } from '../../utils/LnurlPayUtils';
import { unitsStore } from '../../stores/Stores';

const FIXED_SATS = 12618;

const lnurlParams = (minSats: number, maxSats: number) => ({
    domain: 'example.com',
    callback: 'https://example.com/callback',
    minSendable: minSats * 1000,
    maxSendable: maxSats * 1000,
    metadata: JSON.stringify([['text/plain', 'test']]),
    commentAllowed: 0
});

const makeView = (params: { [key: string]: any }) =>
    new LnurlPay({
        navigation: {
            addListener: jest.fn(),
            removeListener: jest.fn(),
            navigate: jest.fn(),
            goBack: jest.fn()
        },
        route: { params },
        // resetUnits() is a no-op here, so the screen has to get the unit
        // right on its own
        UnitsStore: { resetUnits: jest.fn() },
        ContactStore: { contacts: [] },
        CashuStore: {},
        InvoicesStore: {},
        LnurlPayStore: {}
    } as unknown as React.ComponentProps<typeof LnurlPay>);

// AmountInput sits a few levels deep (Screen > ScrollView > View > View)
const findByType = (node: any, type: unknown): any => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findByType(child, type);
            if (found) return found;
        }
        return undefined;
    }
    if (!React.isValidElement(node)) return undefined;
    if (node.type === type) return node;
    return findByType((node.props as any).children, type);
};

// First element whose own text contains `text` (localeString returns keys)
const findByText = (node: any, text: string): any => {
    if (!node || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
        for (const child of node) {
            const found = findByText(child, text);
            if (found) return found;
        }
        return undefined;
    }
    if (!React.isValidElement(node)) return undefined;
    const { children } = node.props as any;
    if (typeof children === 'string' && children.includes(text)) return node;
    return findByText(children, text);
};

const amountInputProps = (view: LnurlPay) => {
    const input = findByType(view.render(), AmountInput) as React.ReactElement<
        React.ComponentProps<typeof AmountInput>
    >;
    expect(input).toBeDefined();
    return input.props;
};

describe('LnurlPay fixed-amount prefill', () => {
    afterEach(() => {
        unitsStore.units = 'sats';
    });

    it('prefills a fixed request in sats while units are fiat', () => {
        unitsStore.units = 'fiat';
        const view = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS)
        });

        expect(view.state.amount).toBe('12618');
        expect(view.state.satAmount).toBe(FIXED_SATS);
        expect(amountInputProps(view).forceUnit).toBe('sats');
    });

    it('prefills a fixed request in sats while units are BTC', () => {
        unitsStore.units = 'BTC';
        const view = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS)
        });

        expect(view.state.amount).toBe('12618');
        expect(view.state.satAmount).toBe(FIXED_SATS);
        expect(amountInputProps(view).forceUnit).toBe('sats');
    });

    it('ignores a satAmount param on a fixed request', () => {
        unitsStore.units = 'fiat';
        // Send forwards its own amount as a string (validateAddress in Send.tsx)
        const view = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS),
            satAmount: '5000'
        });

        expect(view.state.amount).toBe('12618');
        expect(view.state.satAmount).toBe(FIXED_SATS);
        expect(amountInputProps(view)).toMatchObject({
            amount: '12618',
            forceUnit: 'sats',
            locked: true
        });
    });

    it('ignores an amount param on a fixed request', () => {
        unitsStore.units = 'fiat';
        const view = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS),
            amount: '2.50'
        });

        expect(view.state.amount).toBe('12618');
        expect(view.state.satAmount).toBe(FIXED_SATS);
        expect(amountInputProps(view)).toMatchObject({
            amount: '12618',
            forceUnit: 'sats',
            locked: true
        });
    });

    it('keeps the fixed amount when the screen regains focus after a switch to fiat', () => {
        const view = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS)
        });
        // setState on a class that was never mounted does nothing, so apply
        // it directly to see what the screen would render next
        jest.spyOn(view, 'setState').mockImplementation((update: any) => {
            view.state = { ...view.state, ...update };
        });
        view.componentDidMount();
        const [[event, onFocus]] = (
            view.props.navigation.addListener as jest.Mock
        ).mock.calls;
        expect(event).toBe('focus');

        unitsStore.units = 'fiat';
        onFocus();

        expect(view.state.amount).toBe('12618');
        expect(view.state.satAmount).toBe(FIXED_SATS);
        expect(amountInputProps(view).forceUnit).toBe('sats');
    });

    it('starts a variable request empty', () => {
        unitsStore.units = 'fiat';
        const view = makeView({ lnurlParams: lnurlParams(1, 100000) });

        expect(view.state.amount).toBe('');
        expect(view.state.satAmount).toBe('');
        expect(amountInputProps(view).forceUnit).toBeUndefined();
    });

    it('still prefills a variable request from a satAmount param in the current unit', () => {
        unitsStore.units = 'fiat';
        const view = makeView({
            lnurlParams: lnurlParams(1, 100000),
            satAmount: '5000'
        });

        expect(view.state.amount).toBe('2.50');
        expect(view.state.satAmount).toBe('5000');
        expect(amountInputProps(view).forceUnit).toBeUndefined();
    });

    it('prefills a variable request from an amount param', () => {
        unitsStore.units = 'fiat';
        const view = makeView({
            lnurlParams: lnurlParams(1, 100000),
            amount: '2.50'
        });

        expect(view.state.amount).toBe('2.50');
        expect(view.state.satAmount).toBe(5000);
        expect(amountInputProps(view)).toMatchObject({
            amount: '2.50',
            forceUnit: undefined,
            locked: false
        });
    });
});

describe('LnurlPay fixed and variable requests', () => {
    it('resets units only for a fixed request', () => {
        const fixedView = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS)
        });
        const variableView = makeView({ lnurlParams: lnurlParams(1, 100000) });

        expect(fixedView.props.UnitsStore.resetUnits).toHaveBeenCalledTimes(1);
        expect(variableView.props.UnitsStore.resetUnits).not.toHaveBeenCalled();
    });

    it('shows the min-max range only for a variable request', () => {
        const fixedView = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS)
        });
        const variableView = makeView({ lnurlParams: lnurlParams(1, 100000) });

        expect(findByType(fixedView.render(), Amount)).toBeUndefined();
        expect(findByType(variableView.render(), Amount).props.sats).toBe(1);
    });

    it('labels only a fixed request as a fixed amount', () => {
        const fixedView = makeView({
            lnurlParams: lnurlParams(FIXED_SATS, FIXED_SATS)
        });
        const variableView = makeView({ lnurlParams: lnurlParams(1, 100000) });

        expect(
            findByText(fixedView.render(), 'views.ClinkPay.fixedAmount').props
                .children
        ).toBe(' (views.ClinkPay.fixedAmount)');
        expect(
            findByText(variableView.render(), 'views.ClinkPay.fixedAmount')
        ).toBeUndefined();
    });
});

describe('LnurlPay with invalid lnurlParams', () => {
    let alertSpy: jest.SpyInstance;

    beforeEach(() => {
        alertSpy = jest
            .spyOn(Alert, 'alert')
            .mockImplementation(() => undefined);
    });

    // Restored here, not in the test, so a failing assertion can't leak it
    afterEach(() => {
        alertSpy.mockRestore();
    });

    // The alert carries our message, not a TypeError, and the amount input
    // is never rendered
    const expectRejected = (view: LnurlPay) => {
        expect(alertSpy).toHaveBeenCalledWith(
            'views.LnurlPay.LnurlPay.invalidParams',
            'views.LnurlPay.LnurlPay.errorInvalidRequest',
            expect.any(Array),
            { cancelable: false }
        );
        expect(findByType(view.render(), AmountInput)).toBeUndefined();
    };

    it('rejects missing lnurlParams and keeps the units', () => {
        const view = makeView({});

        expectRejected(view);
        expect(view.state).toMatchObject({
            amount: '',
            satAmount: '',
            domain: ''
        });
        expect(view.props.UnitsStore.resetUnits).not.toHaveBeenCalled();
    });

    it('rejects a request with only a callback', () => {
        expectRejected(
            makeView({
                lnurlParams: {
                    callback: 'https://example.com/callback',
                    tag: 'payRequest'
                }
            })
        );
    });

    it('rejects a request whose minSendable is above maxSendable', () => {
        expectRejected(makeView({ lnurlParams: lnurlParams(2000, 1000) }));
    });

    it.each([
        ['a request without a callback', { callback: undefined }],
        ['a string minSendable', { minSendable: '1000' }],
        ['a NaN maxSendable', { maxSendable: NaN }],
        ['an Infinity maxSendable', { maxSendable: Infinity }]
    ])('rejects %s', (_name, change) => {
        expectRejected(
            makeView({ lnurlParams: { ...lnurlParams(1, 100000), ...change } })
        );
    });

    it('renders only the header, with a way back', () => {
        const tree = makeView({}).render();

        expect(findByType(tree, 'Header').props.leftComponent).toBe('Back');
        expect(findByType(tree, AmountInput)).toBeUndefined();
    });

    it('goes back when the alert is dismissed', () => {
        const view = makeView({});
        const [, , buttons] = alertSpy.mock.calls[0];

        buttons[0].onPress();

        expect(view.props.navigation.goBack).toHaveBeenCalledTimes(1);
    });
});

describe('LnurlPay fixed amounts that are not whole sats', () => {
    const fetchMock = ReactNativeBlobUtil.fetch as jest.Mock;
    let alertSpy: jest.SpyInstance;

    const lnurlParamsMsat = (msat: number) => ({
        domain: 'example.com',
        callback: 'https://example.com/callback',
        minSendable: msat,
        maxSendable: msat,
        metadata: JSON.stringify([['text/plain', 'test']]),
        commentAllowed: 0
    });

    // sendValues on a view that was never mounted: apply setState to the
    // state object directly, like the focus test above
    const makeSendableView = (msat: number) => {
        const view = makeView({ lnurlParams: lnurlParamsMsat(msat) });
        jest.spyOn(view, 'setState').mockImplementation((update: any) => {
            view.state = {
                ...view.state,
                ...(typeof update === 'function' ? update(view.state) : update)
            };
        });
        return view;
    };

    // Press Confirm and return the amount the callback was called with.
    // The mocked fetch answers with an error envelope, so the flow stops
    // right after the callback request.
    const callbackAmount = async (view: LnurlPay) => {
        fetchMock.mockResolvedValue({
            json: () => ({ status: 'ERROR', reason: 'stop here' }),
            text: () => 'stop here'
        });
        const button = findByType(view.render(), Button);
        expect(button.props.disabled).toBeFalsy();
        await button.props.onPress();
        // flush the fetch promise chain
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setImmediate(resolve));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const calledUrl = fetchMock.mock.calls[0][1] as string;
        const match = calledUrl.match(/[?&]amount=([^&]*)/);
        expect(match).not.toBeNull();
        return decodeURIComponent(match![1]);
    };

    beforeEach(() => {
        fetchMock.mockReset();
        (isLnurlCallbackAllowed as jest.Mock).mockReturnValue({ ok: true });
        alertSpy = jest
            .spyOn(Alert, 'alert')
            .mockImplementation(() => undefined);
    });

    afterEach(() => {
        alertSpy.mockRestore();
    });

    it('keeps the msat precision of a fixed amount in state', () => {
        const view = makeSendableView(12618500);

        expect(view.state.satAmount).toBe(12618.5);
        expect(view.state.amount).toBe('12618.5');
    });

    it('sends a fixed 12618500 msat request as 12618500, not 12618000', async () => {
        const view = makeSendableView(12618500);

        await expect(callbackAmount(view)).resolves.toBe('12618500');
    });

    it('sends a fixed 1001 msat request as 1001, not 1000', async () => {
        const view = makeSendableView(1001);

        expect(view.state.satAmount).toBe(1.001);
        await expect(callbackAmount(view)).resolves.toBe('1001');
    });

    it('can send a fixed 500 msat request at all', async () => {
        const view = makeSendableView(500);

        expect(view.state.satAmount).toBe(0.5);
        await expect(callbackAmount(view)).resolves.toBe('500');
    });

    it('still sends a fixed whole-sat request unchanged', async () => {
        const view = makeSendableView(12618000);

        expect(view.state.satAmount).toBe(FIXED_SATS);
        expect(view.state.amount).toBe('12618');
        await expect(callbackAmount(view)).resolves.toBe('12618000');
    });
});
