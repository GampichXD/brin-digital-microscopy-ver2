export type ToastType = 'success' | 'error' | 'info' | 'warning';

export const showToast = (message: string, type: ToastType = 'info') => {
  window.dispatchEvent(
    new CustomEvent('show-toast', {
      detail: { message, type },
    })
  );
};
