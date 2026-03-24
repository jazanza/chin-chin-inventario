import { toast } from "sonner";

/**
 * Muestra un toast de éxito con fondo verde.
 * @param message Mensaje a mostrar
 */
export const showSuccess = (message: string) => {
  toast.success(message, {
    style: {
      backgroundColor: '#10b981', // Verde esmeralda
      color: '#ffffff',
      border: 'none',
    },
    duration: 3000,
  });
};

/**
 * Muestra un toast de error con fondo rojo.
 * @param message Mensaje a mostrar
 */
export const showError = (message: string) => {
  toast.error(message, {
    style: {
      backgroundColor: '#ef4444', // Rojo
      color: '#ffffff',
      border: 'none',
    },
    duration: 4000,
  });
};

/**
 * Muestra un toast de carga.
 * @param message Mensaje a mostrar
 */
export const showLoading = (message: string) => {
  return toast.loading(message);
};

/**
 * Descarta un toast específico.
 * @param toastId ID del toast a descartar
 */
export const dismissToast = (toastId: string | number) => {
  toast.dismiss(toastId);
};