} else if (payload.eventType === 'DELETE') {
              const dateKey = payload.old?.dateKey; // <-- Intenta obtener dateKey del objeto 'old'
              if (!dateKey) { // <-- Si dateKey es undefined o null
                console.error('[Realtime] DELETE event without dateKey. Ensure REPLICA IDENTITY FULL is set on the table.'); // <-- Se registra un error
                return; // <-- Se detiene la ejecución
              }

              await db.sessions.delete(dateKey);
              console.log(`[Realtime] Session ${dateKey} deleted from remote.`);
              showSuccess(`Sesión del ${dateKey} eliminada remotamente.`);

              if (state.sessionId === dateKey) {
                dispatch({ type: 'RESET_STATE' });
                dispatch({ type: 'SET_SESSION_ID', payload: null });
              }
              await getSessionHistory();
            }