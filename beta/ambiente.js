/**
 * ARQUIVO: ambiente.js
 * Descrição: Gerencia configurações de ambiente (Beta/Produção)
 */
const Ambiente = {
    detectar: function() {
        // Detecta se a URL contém termos de ambiente de teste
        const isBeta = /beta|teste|localhost|127\.0\.0\.1/.test(window.location.href);
        
        if (isBeta) {
            document.title = "[BETA] " + document.title;
            console.log("🛠️ Ambiente Beta detectado.");
            this.aplicarEstiloBeta();
        }
    },

    aplicarEstiloBeta: function() {
        // Aguarda o carregamento do header para aplicar estilos
        const checkHeader = setInterval(() => {
            const header = document.querySelector('.app-header');
            if (header) {
                // Estilo visual diferenciado para o Header
                header.style.backgroundColor = "#fff3cd"; // Amarelo claro de alerta
                header.style.borderBottom = "2px solid #ffeeba";
                
                // Injeta etiqueta visual de Beta
                const badge = document.createElement('div');
                badge.id = "beta-label";
                badge.style = `
                    position: absolute; 
                    top: 42px; 
                    left: 50%; 
                    transform: translateX(-50%); 
                    background: #856404; 
                    color: white; 
                    font-size: 10px; 
                    padding: 2px 8px; 
                    border-radius: 0 0 8px 8px; 
                    z-index: 1001; 
                    font-weight: bold;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                `;
                badge.innerText = "MODO BETA / TESTE";
                header.appendChild(badge);
                
                clearInterval(checkHeader);
            }
        }, 100);
    }
};

// Execução imediata da detecção
Ambiente.detectar();