// Спрашивает длину отрезка в метрах. Ответ — число или null, если человек передумал.
export function lengthDialog(dialog) {
  const input = dialog.querySelector('input');
  const px = dialog.querySelector('[data-px]');
  return (pixels) => new Promise((resolve) => {
    input.value = '';
    px.textContent = `${Math.round(pixels)} px`;
    dialog.returnValue = '';
    dialog.showModal();
    input.focus();
    dialog.addEventListener('close', () => {
      const meters = Number(input.value.replace(',', '.'));
      resolve(dialog.returnValue === 'ok' ? meters : null); // неверное число проверит Project.calibrate
    }, { once: true });
  });
}
