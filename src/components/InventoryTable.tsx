useEffect(() => {
  // Cuando inventoryData (la lista filtrada del contexto) cambia, actualizamos el estado local
  setEditableInventory(inventoryData);
}, [inventoryData]);