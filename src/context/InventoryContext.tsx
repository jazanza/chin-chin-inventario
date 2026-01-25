useEffect(() => {
  debouncedSaveCurrentSessionRef.current = debounce(async (data: InventoryItem[]) => {
    if (state.sessionId && state.inventoryType) {
      console.log('[Debounced Save] Executing debounced save for current session.');
      await saveCurrentSession(data, state.inventoryType, new Date());
    }
  }, 1000); // Guardar 1 segundo después de la última edición

  // Cleanup para el debounce
  return () => {
    debouncedSaveCurrentSessionRef.current?.cancel();
  };
}, [state.sessionId, state.inventoryType, saveCurrentSession]);