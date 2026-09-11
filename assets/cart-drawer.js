import { DialogComponent, DialogOpenEvent, DialogCloseEvent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';
import { isMobileBreakpoint } from '@theme/utilities';

/**
 * A custom element that manages a cart drawer.
 *
 * @typedef {object} Refs
 * @property {HTMLDialogElement} dialog - The dialog element.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** @type {number} */
  #summaryThreshold = 0.5;

  /** @type {AbortController | null} */
  #historyAbortController = null;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.addEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
    this.addEventListener(DialogOpenEvent.eventName, this.#handleHistoryOpen);
    this.addEventListener(DialogCloseEvent.eventName, this.#handleHistoryClose);

    if (history.state?.cartDrawerOpen) {
      history.replaceState(null, '');
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.removeEventListener(DialogOpenEvent.eventName, this.#updateStickyState);
    this.removeEventListener(DialogOpenEvent.eventName, this.#handleHistoryOpen);
    this.removeEventListener(DialogCloseEvent.eventName, this.#handleHistoryClose);
    this.#historyAbortController?.abort();
  }

  #handleHistoryOpen = () => {
    if (!isMobileBreakpoint()) return;

    if (!history.state?.cartDrawerOpen) {
      history.pushState({ cartDrawerOpen: true }, '');
    }

    this.#historyAbortController = new AbortController();
    window.addEventListener('popstate', this.#handlePopState, { signal: this.#historyAbortController.signal });
  };

  #handleHistoryClose = () => {
    this.#historyAbortController?.abort();
    if (history.state?.cartDrawerOpen) {
      history.back();
    }
  };

  #handlePopState = async () => {
    if (this.refs.dialog?.open) {
      this.refs.dialog.style.setProperty('--dialog-drawer-closing-animation', 'none');
      await this.closeDialog();
      this.refs.dialog.style.removeProperty('--dialog-drawer-closing-animation');
    }
  };

  #handleCartAdd = () => {
    if (this.hasAttribute('auto-open')) {
      this.open(); // ← remplacé pour passer par open() et déclencher le dataLayer
    }
  };

  open() {
    this.showDialog();

    // 🛒 GA4 - view_cart
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ ecommerce: null });

    fetch('/cart.js')
      .then(res => res.json())
      .then(cart => {
        window.dataLayer.push({
          event: 'view_cart',
          ecommerce: {
            currency: cart.currency,
            value: (cart.total_price / 100).toFixed(2),
            items: cart.items.map((item, index) => ({
              item_id: item.sku || String(item.variant_id),
              item_name: item.product_title,
              item_variant: item.variant_title,
              price: (item.final_price / 100).toFixed(2),
              quantity: item.quantity,
              index: index
            }))
          }
        });
      });

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }

  #updateStickyState() {
    const { dialog } = /** @type {Refs} */ (this.refs);
    if (!dialog) return;

    // Refs do not cross nested `*-component` boundaries (e.g., `cart-items-component`), so we query within the dialog.
    const content = dialog.querySelector('.cart-drawer__content');
    const summary = dialog.querySelector('.cart-drawer__summary');

    if (!content || !summary) {
      // Ensure the dialog doesn't get stuck in "unsticky" mode when summary disappears (e.g., empty cart).
      dialog.setAttribute('cart-summary-sticky', 'false');
      return;
    }

    const drawerHeight = dialog.getBoundingClientRect().height;
    const summaryHeight = summary.getBoundingClientRect().height;
    const ratio = summaryHeight / drawerHeight;
    dialog.setAttribute('cart-summary-sticky', ratio > this.#summaryThreshold ? 'false' : 'true');
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}