// ============================================
// CONFIGURAÇÃO API
// ============================================
const API_URL = "https://script.google.com/macros/s/AKfycbw_B0RlBbzKBft76h-HT1kYjE9fbh2udZfZ-uuMMgmLReBlFiIl2N3Xkv_pE8ndBKn1mA/exec";

// --- ESTADO GLOBAL ---
var usuarioEmail = ""; var usuarioNome = ""; var usuarioNivel = "";
var mapaAtual = null; var mapaUnico = null; var enderecosCache = {}; var territorioInfoCache = {};
var idTerritorioParaDesignar = null; var emailUsuarioEdicao = null; var idTerritorioEdicao = null;
var enderecoAtualId = null; var territorioAtualId = null; var registroTrabalhoLocal = {};
var territorioAtualIsMeu = false;

// --- SERVIÇO DE API ---
async function chamarAPI(acao, dados = {}) {
    if (API_URL.includes("SUA_URL")) return { erro: "Configuração" };
    dados.acao = acao;
    try {
        const response = await fetch(API_URL, { method: "POST", body: JSON.stringify(dados) });
        return await response.json();
    } catch (e) { return { erro: e.toString() }; }
}

// --- UX & NAVEGAÇÃO ---
function toggleModal(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.toggle('hidden');
}

function mostrarNotificacao(msg, tipo = "sucesso") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<span class="material-icons">${tipo === 'sucesso' ? 'check_circle' : 'error'}</span> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 10);
    setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 300); }, 3000);
}

// --- FUNÇÃO DE NAVEGAÇÃO SPA ---
function navegarPara(idTela) {
    document.querySelectorAll('.app-view').forEach(t => {
        t.classList.remove('active');
        t.classList.add('hidden');
    });
    var tela = document.getElementById(idTela);
    if (tela) {
        tela.classList.remove('hidden');
        setTimeout(() => tela.classList.add('active'), 10);
    }
}

function atualizarPWA() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        mostrarNotificacao("Verificando atualizações...", "sucesso");
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(() => window.location.reload(), 1000);
    } else { window.location.reload(); }
}

// --- INICIALIZAÇÃO CONTROLADA PELO SHELL ---
function iniciarApp() {
    console.log("🚀 App iniciado via Shell");
    if (typeof Ambiente !== 'undefined') Ambiente.detectar();

    var emailSalvo = localStorage.getItem('app_territorios_email');

    if (emailSalvo) {
        // --- ADICIONE ESTAS DUAS LINHAS ABAIXO ---
        // Elas escondem a tela de login e mostram o aviso antes mesmo da API responder
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
        mostrarNotificacao("Entrando automaticamente...", "info");

        usuarioEmail = emailSalvo;

        chamarAPI("verificarLogin", { email: emailSalvo }).then(r => {
            if (r.erro || r.status === "NAO_ENCONTRADO") {
                localStorage.removeItem('app_territorios_email');
                navegarPara('tela-login');
            } else {
                processarLogin(r);
            }
        });
    } else {
        // Se não tem nada salvo, aí sim vai para a tela de login
        navegarPara('tela-login');
    }

    // Carrega a lista de cidades/bairros em segundo plano
    setTimeout(carregarDadosLocais, 2000);

    // Registro do Service Worker
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log("SW registrado com sucesso"));
    }
}

// --- AUTH ---
function fazerLogin() {
    var email = document.getElementById('login-email').value.trim().toLowerCase(); // Adicionado toLowerCase
    if (!email) return mostrarNotificacao("Digite seu e-mail.", "erro");

    usuarioEmail = email;
    mostrarNotificacao("Verificando...", "info");
    chamarAPI("verificarLogin", { email: email }).then(processarLogin);
}

function processarLogin(r) {
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

    if (r.status === "APROVADO") {
        usuarioNome = r.nome;
        usuarioNivel = r.nivel;
        localStorage.setItem('app_territorios_email', usuarioEmail);

        // Preenche perfil
        document.getElementById('perfil-nome').innerText = r.nome;
        document.getElementById('perfil-email').innerText = usuarioEmail;
        document.getElementById('perfil-funcao').innerText = r.nivel;
        if (document.getElementById('header-nome-usuario')) {
            document.getElementById('header-nome-usuario').innerText = r.nome;
        }

        var roles = r.nivel.toLowerCase();

        // --- DEFINIÇÃO DE PAPÉIS ---

        // 1. GESTORES (Servo ou Dirigente ou Admin)
        // Eles veem o Painel Admin (para aprovar territórios) e o Sino.
        var isGestor = roles.includes('admin') || roles.includes('servo') || roles.includes('dirigente');

        // 2. EDITOR (Quem mexe nos endereços)
        // Apenas quem tem "Editor" explicitamente vê a Gestão de Dados.
        var isEditor = roles.includes('editor');

        // 3. ADMIN (Superusuário)
        // Pode aprovar cadastros de usuários novos.
        var isAdmin = roles.includes('admin');


        // --- CONTROLE DOS BOTÕES ---

        // Botão "Gestão" (Lista de Endereços) -> SÓ EDITOR
        document.getElementById('nav-gestao').classList.toggle('hidden', !isEditor);

        // Painel Admin e Sino -> GESTORES (Admin, Servo, Dirigente)
        document.getElementById('area-admin-panel').classList.toggle('hidden', !isGestor);
        document.getElementById('btn-admin-bell').classList.toggle('hidden', !isGestor);

        // Botão de Imprimir -> Editor ou Admin
        if ((isEditor || isAdmin) && !document.querySelector('.btn-print')) {
            var btnPrint = document.createElement('button');
            btnPrint.className = 'btn-print';
            btnPrint.innerHTML = '<span class="material-icons">print</span> Imprimir Cartões';
            btnPrint.onclick = () => alert("Geração de PDF em desenvolvimento.");

            var modalBody = document.querySelector('#modal-perfil .modal-body');
            if (modalBody) modalBody.insertBefore(btnPrint, modalBody.lastElementChild);
        }

        document.getElementById('app-header').classList.remove('hidden');
        document.getElementById('app-footer').classList.remove('hidden');

        navegarPara('tela-sistema');
        carregarSistema();

    } else if (r.status === "PENDENTE") {
        navegarPara('tela-pendente');
    } else {
        navegarPara('tela-cadastro');
    }
}

function fazerLogout() {
    localStorage.removeItem('app_territorios_email');
    usuarioEmail = ""; usuarioNome = ""; usuarioNivel = "";
    document.getElementById('login-email').value = "";
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('app-footer').classList.add('hidden');
    document.getElementById('area-admin-panel').classList.add('hidden');
    document.getElementById('nav-gestao').classList.add('hidden');
    document.getElementById('btn-admin-bell').classList.add('hidden');
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
    navegarPara('tela-login');
    mostrarNotificacao("Você saiu do sistema.", "sucesso");
}

// --- LÓGICA PRINCIPAL DO SISTEMA ---
function carregarSistema() {
    document.getElementById('lista-territorios').innerHTML = '<p style="text-align:center;">Carregando...</p>';
    chamarAPI("buscarTerritorios", { email: usuarioEmail }).then(renderizarDados);
    carregarSolicitacoes();
}

function renderizarDados(res) {
    var div = document.getElementById('lista-territorios');
    div.innerHTML = '';

    var roles = usuarioNivel.toLowerCase();

    // 1. Quem pode forçar a devolução (Admin, Dirigente, Servo)
    var isAdmin = roles.includes('admin') || roles.includes('dirigente') || roles.includes('servo');

    // 2. Quem pode ver o botão "Ver Endereços" (Todos os níveis autenticados)
    // Se você quiser que o publicador veja, basta incluir ele aqui.
    var podeVerMapa = roles.includes('admin') || roles.includes('dirigente') || roles.includes('servo') || roles.includes('editor') || roles.includes('publicador');

    (res.mapas || []).forEach(t => {
        var classe = t.isMeu ? 'status-Meu' : 'status-' + t.status;
        var btnHtml = '';

        // Botões de Ação (Pedir/Devolver)
        if (t.isMeu) {
            btnHtml += `<button class="btn-vermelho" onclick="tendarDevolver('${t.id}')">Devolver</button>`;
        } else if (isAdmin && t.status === 'Ocupado') {
            btnHtml += `<button class="btn-vermelho" style="border:1px dashed red;" onclick="tendarDevolver('${t.id}')">Devolver (Admin)</button>`;
        } else if (t.status === 'Livre') {
            btnHtml += `<button class="btn-pedir" onclick="acionar('${t.id}', 'pedir')">Pedir</button>`;
        } else {
            btnHtml += `<button class="btn-desabilitado" disabled>Ocupado</button>`;
        }

        // Botão de Designar (Backend decide se t.podeGerenciar é true)
        if (t.podeGerenciar) btnHtml += `<button class="btn-designar" onclick="acionar('${t.id}', 'designar')">Designar</button>`;

        // AQUI ESTAVA O BLOQUEIO:
        // Agora usamos a variável 'podeVerMapa' que inclui o Publicador
        var mapBtn = (t.podeAbrir || podeVerMapa) ? `<button class="btn-mapa" onclick="abrirMapa('${t.id}', '${t.nome}', ${t.isMeu})">Ver Endereços</button>` : '';

        var info = '';
        if (t.status === 'Ocupado' && t.responsavel) {
            var icone = (t.modo === 'Impresso' || t.modo === 'OFFLINE') ? '📄' : '📱';
            info = `<div style="margin-top:8px;color:#555;font-size:0.85rem;">${icone} <b>${t.responsavel}</b></div>`;
        }

        div.innerHTML += `<div class="card ${classe}"><h3>${t.id}</h3><p><b>${t.nome}</b></p><p>${t.status}${t.isMeu ? ' (Você)' : ''}</p>${info}${btnHtml}${mapBtn}</div>`;
    });
}

// --- MAPAS ---
// --- MAPAS (CORRIGIDO) ---
function abrirMapa(id, nome, isMeu) {
    if (mapaAtual) { mapaAtual.off(); mapaAtual.remove(); mapaAtual = null; }

    var modalMap = document.getElementById('modal-mapa');
    if (modalMap.classList.contains('hidden')) { toggleModal('modal-mapa'); }

    document.getElementById('conteudo-mapa').innerHTML = '<div style="height:250px; background:#f0f0f0; display:flex; align-items:center; justify-content:center; border-radius:8px; color:#999;">Carregando mapa...</div>';
    document.getElementById('titulo-mapa').innerText = 'Cartão Nº: ' + id;
    territorioAtualIsMeu = isMeu;

    chamarAPI("buscarEnderecosPorTerritorio", { id: id }).then(res => {
        // Salva no cache global para uso posterior
        enderecosCache[id] = res.enderecos;
        territorioInfoCache[id] = { nome: nome, cidade: res.cidade };

        // Monta HTML básico
        document.getElementById('conteudo-mapa').innerHTML =
            '<div id="leaflet-map-container" style="height:250px; position:relative; z-index: 1;">' +
            '<button class="btn-fullscreen" onclick="toggleFullscreenMap(\'leaflet-map-container\')" style="position: absolute; top: 10px; right: 10px; z-index: 1000; background: white; border: none; border-radius: 4px; padding: 5px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">' +
            '<span class="material-icons" style="font-size: 20px; color: #333;">fullscreen</span>' +
            '</button>' +
            '</div>' +
            '<ul class="lista-enderecos-cartao" style="padding: 0; list-style: none; margin-top: 10px;"></ul>' +
            '<div id="area-botoes-mapa-geral" style="display:flex; flex-direction:column; gap:10px; margin-top:15px;"></div>';

        var ul = document.querySelector('.lista-enderecos-cartao');

        // Renderiza Mapa e Lista com pequeno delay para o DOM estar pronto
        setTimeout(() => {
            mapaAtual = L.map('leaflet-map-container');
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaAtual);
            var bounds = [];

            // Renderiza Lista de Endereços
            if (res.enderecos && res.enderecos.length > 0) {
                res.enderecos.forEach((end, i) => {
                    var latLng = [parseFloat(end.lat), parseFloat(end.lng)];
                    bounds.push(latLng);

                    var temVisita = end.ultimoStatus && end.ultimoStatus !== "" && end.ultimoStatus !== "Nao Visitado";
                    var check = temVisita ? '<span style="color:green; margin-left:5px;">✅</span>' : '';
                    var refHtml = end.referencia ? `<div style="font-size: 0.85rem; color: #e67e22; margin-top: 2px;">Ref: ${end.referencia}</div>` : '';

                    var li = document.createElement('li');
                    li.style.borderBottom = '1px solid #eee';
                    li.style.padding = '10px 0';
                    li.style.cursor = 'pointer';
                    li.innerHTML = `
                        <div style="display: flex; align-items: flex-start;">
                            <span style="font-weight: bold; color: #3498db; margin-right: 8px; min-width: 25px;">${i + 1}.</span>
                            <div style="flex: 1;">
                                <div style="font-weight: 500; color: #333;">${end.rua}, ${end.numero} ${check}</div>
                                ${refHtml}
                            </div>
                            <span class="material-icons" style="color: #ccc; font-size: 20px;">chevron_right</span>
                        </div>`;
                    li.onclick = () => abrirDetalhesEndereco(i + 1, id);
                    ul.appendChild(li);

                    // Marcador no Mapa
                    L.marker(latLng).addTo(mapaAtual).bindPopup(`<b>${i + 1}</b>. ${end.rua}, ${end.numero}`);
                });

                if (bounds.length) mapaAtual.fitBounds(bounds, { padding: [30, 30] });
            } else {
                ul.innerHTML = '<li style="text-align:center; padding:20px; color:#999;">Nenhum endereço cadastrado.</li>';
            }

            // CHAMA A FUNÇÃO DE BOTÕES (Passando os dados corretos)
            adicionarBotoesMapaGeral(id, nome, res.enderecos || []);

        }, 100);
    });
}

function adicionarBotoesMapaGeral(id, nome, ends) {
    var area = document.getElementById('area-botoes-mapa-geral');
    if (!area) return;
    area.innerHTML = '';

    // 1. BOTÃO PDF (CORRIGIDO PARA USAR MODAL BONITO)
    var btnPdf = document.createElement('button');
    btnPdf.className = 'btn-azul';
    btnPdf.style.background = '#e74c3c';
    btnPdf.innerHTML = '<span class="material-icons">picture_as_pdf</span> Cartão PDF';

    // AQUI ESTAVA O PROBLEMA: Mudamos de confirm() para abrirDecisaoPDF()
    btnPdf.onclick = () => {
        abrirDecisaoPDF(id);
    };
    area.appendChild(btnPdf);

    // 2. BOTÃO WHATSAPP
    var btnZap = document.createElement('button');
    btnZap.className = 'btn-verde';
    btnZap.innerHTML = '<span class="material-icons">share</span> WhatsApp';
    btnZap.onclick = () => {
        var linkRota = gerarLinkRota(ends);
        var mensagem = `🗺️ *Território ${id} - ${nome}*`;
        ends.forEach((e, i) => {
            mensagem += `\n\n${i + 1}. ${e.rua}, ${e.numero}`;
            if (e.referencia) mensagem += `\n   Ref: ${e.referencia}`;
            mensagem += `\n   📍 GPS: http://maps.google.com/?q=${e.lat},${e.lng}`;
        });
        mensagem += `\n\n🚗 *Rota:* ${linkRota}`;
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(mensagem)}`);
    };
    area.appendChild(btnZap);

    // 3. BOTÃO ROTA E RELATÓRIO
    var btnRota = document.createElement('button');
    btnRota.className = 'btn-azul';
    btnRota.innerHTML = '<span class="material-icons">directions_car</span> Rota GPS';
    btnRota.onclick = () => window.open(gerarLinkRota(ends), '_blank');
    area.appendChild(btnRota);

    var btnRel = document.createElement('button');
    btnRel.className = 'btn-azul';
    btnRel.style.background = '#8e44ad';
    btnRel.innerHTML = '<span class="material-icons">history</span> Histórico';
    btnRel.onclick = () => abrirRelatorioVisitas(id);
    area.appendChild(btnRel);
}



function gerarLinkRota(enderecos) {
    if (!enderecos || enderecos.length === 0) return "";
    var ultimo = enderecos[enderecos.length - 1];
    var destino = `${ultimo.lat},${ultimo.lng}`;
    var waypoints = enderecos.slice(0, enderecos.length - 1).map(e => `${e.lat},${e.lng}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&destination=${destino}&waypoints=${waypoints}&travelmode=driving`;
}

function abrirDecisaoPDF(idTerritorio) {
    // Verifica se já temos um link salvo (cache local do app)
    // Nota: O ideal seria a API retornar se já existe PDF junto com os endereços, 
    // mas vamos simplificar perguntando ao usuário ou assumindo "Gerar" na primeira vez.

    // Vamos usar o modal de confirmação para dar uma experiência melhor
    var modal = document.getElementById('modal-confirmacao');
    var titulo = document.getElementById('confirm-titulo');
    var texto = document.getElementById('confirm-texto');
    var containerBtns = document.querySelector('#modal-confirmacao .acoes-confirmacao');

    if (modal.classList.contains('hidden')) toggleModal('modal-confirmacao');

    titulo.innerText = "Cartão PDF";
    texto.innerHTML = `<div style="text-align:center;">
        <span class="material-icons" style="font-size:48px; color:#e74c3c;">picture_as_pdf</span>
        <p style="margin-top:10px; font-size:1.1rem; color:#333;">O que você deseja fazer?</p>
    </div>`;

    containerBtns.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px; width:100%;">
            <button class="btn-verde" onclick="executarGeracaoPDF('${idTerritorio}', false)">
                <span class="material-icons">open_in_new</span> Abrir PDF Atual
            </button>
            
            <button class="btn-azul" onclick="executarGeracaoPDF('${idTerritorio}', true)" style="background:#f39c12;">
                <span class="material-icons">cached</span> Gerar Novo (Atualizar)
            </button>
            
            <button class="btn-vermelho" onclick="toggleModal('modal-confirmacao')" style="background:#eee; color:#333; border:none;">
                Cancelar
            </button>
        </div>
    `;
}

function executarGeracaoPDF(id, forcar) {
    toggleModal('modal-confirmacao'); // Fecha o modal

    var msg = forcar ? "Gerando novo PDF atualizado..." : "Abrindo PDF...";
    mostrarNotificacao(msg, "sucesso");

    chamarAPI("gerarPDF", { id: id, forcar: forcar }).then(res => {
        if (res.erro) {
            mostrarNotificacao("Erro: " + res.erro, "erro");
        } else {
            // Abre o PDF
            window.open(res.url, '_blank');
            if (res.cached) {
                mostrarNotificacao("PDF Aberto (Cache)", "sucesso");
            } else {
                mostrarNotificacao("Novo PDF Gerado!", "sucesso");
            }
        }
    });
}


function abrirRelatorioVisitas(id) {
    toggleModal('modal-relatorio');
    document.getElementById('lista-relatorio-body').innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Carregando histórico...</p>';
    chamarAPI("listarHistoricoTerritorio", { id: id }).then(res => {
        var div = document.getElementById('lista-relatorio-body'); div.innerHTML = '';
        if (!res || res.length === 0) { div.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">Nenhum registro encontrado.</p>'; return; }
        res.forEach(r => {
            var dataF = r.data ? new Date(r.data).toLocaleDateString('pt-BR') : '-';
            var nomeEnd = r.endereco;
            if (enderecosCache[id]) { var found = enderecosCache[id].find(e => e.id == r.endereco); if (found) nomeEnd = `${found.rua}, ${found.numero}`; }
            var cor = '#7f8c8d'; if (r.status === 'Visitado') cor = '#27ae60'; else if (r.status === 'Nao em casa') cor = '#e67e22'; else if (r.status === 'Nao atendeu') cor = '#c0392b';
            var html = `<div style="background:#fff; border-bottom:1px solid #eee; padding:12px 15px;"><div style="font-size:0.8rem; color:#999; display:flex; justify-content:space-between; margin-bottom:4px;"><span>📅 ${dataF}</span><span>👤 ${r.pub}</span></div><div style="font-size:1rem; font-weight:600; color:#333; margin-bottom:4px;">${nomeEnd}</div><div style="display:flex; flex-direction:column;"><span style="color:${cor}; font-weight:bold; font-size:0.9rem;">${r.status}</span>${r.obs ? `<span style="font-size:0.85rem; color:#555; font-style:italic; margin-top:2px;">"${r.obs}"</span>` : ''}</div></div>`;
            div.innerHTML += html;
        });
    });
}

function toggleFullscreenMap(idContainer) {
    var body = document.body;
    var btnIcon = document.querySelector(`#${idContainer} .btn-fullscreen span`);
    if (body.classList.contains('mapa-fullscreen-active')) {
        body.classList.remove('mapa-fullscreen-active');
        btnIcon.innerText = 'fullscreen';
        btnIcon.parentElement.style.background = '#fff'; btnIcon.parentElement.style.color = '#333';
    } else {
        body.classList.add('mapa-fullscreen-active');
        btnIcon.innerText = 'close';
    }
    setTimeout(() => { if (mapaAtual) mapaAtual.invalidateSize(); if (mapaUnico) mapaUnico.invalidateSize(); }, 300);
}

function abrirDetalhesEndereco(num, id) {
    var end = enderecosCache[id][num - 1];
    enderecoAtualId = end.id; territorioAtualId = id;
    var info = territorioInfoCache[id] || {};

    document.getElementById('detalhes-endereco-titulo').innerText = 'Endereço Nº ' + num;
    document.getElementById('detalhes-cidade').innerText = info.cidade || '---';
    document.getElementById('detalhes-bairro').innerText = info.nome || '---';
    document.getElementById('detalhes-rua').innerText = end.rua;
    document.getElementById('detalhes-numero').innerText = end.numero;

    var refElem = document.getElementById('detalhes-referencia');
    var containerRef = document.getElementById('container-referencia');
    if (end.referencia && end.referencia.trim() !== "") { refElem.innerText = end.referencia; if (containerRef) containerRef.style.display = 'block'; } else { if (containerRef) containerRef.style.display = 'none'; }

    var divHist = document.getElementById('historico-ultima-visita');
    if (divHist) {
        if (end.ultimaData) {
            var cor = '#7f8c8d';
            if (end.ultimoStatus === 'Visitado') cor = '#27ae60';
            else if (end.ultimoStatus === 'Nao em casa') cor = '#e67e22';
            else if (end.ultimoStatus === 'Nao atendeu') cor = '#c0392b';
            divHist.innerHTML = `<div style="font-size:0.75rem; font-weight:bold; color:#999; margin-bottom:5px;">ÚLTIMA VISITA (${end.ultimaData})</div><div style="font-weight:bold; color:${cor}; font-size:1rem;">${end.ultimoStatus}</div>${end.ultimaObs ? `<div style="font-style:italic; color:#555; margin-top:3px;">"${end.ultimaObs}"</div>` : ''}`;
            divHist.style.display = 'block';
        } else { divHist.style.display = 'none'; }
    }

    var gpsUrl = `https://www.google.com/maps/dir/?api=1&destination=${end.lat},${end.lng}`;
    var btnGps = document.getElementById('link-gps-externo');
    if (btnGps) btnGps.href = gpsUrl;

    var btnShare = document.getElementById('btn-share-individual');
    if (btnShare) { btnShare.onclick = function () { var txt = `📍 *Endereço:* ${end.rua}, ${end.numero}\n${end.referencia ? 'Ref: ' + end.referencia + '\n' : ''}\n🗺️ *Localização:* ${gpsUrl}`; window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt)}`); }; }

    var box = document.getElementById('box-registro-visita-container');
    if (territorioAtualIsMeu) { box.classList.remove('hidden'); document.getElementById('sel-status-visita').value = ""; document.getElementById('input-obs-visita').value = ""; } else { box.classList.add('hidden'); }

    if (mapaUnico) { mapaUnico.off(); mapaUnico.remove(); mapaUnico = null; }
    toggleModal('modal-endereco');
    setTimeout(() => { var divMap = document.getElementById('leaflet-map-unico'); if (divMap) { divMap.innerHTML = '<div id="map-unico-leaf" style="height:100%; width:100%;"></div>'; mapaUnico = L.map('map-unico-leaf').setView([end.lat, end.lng], 18); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaUnico); L.marker([end.lat, end.lng]).addTo(mapaUnico); } }, 200);
}

function salvarVisitaAtual() {
    var status = document.getElementById('sel-status-visita').value;
    var obs = document.getElementById('input-obs-visita').value;
    if (!status) return mostrarNotificacao("Selecione um status.", "erro");
    mostrarNotificacao("Salvando...", "sucesso");
    chamarAPI("salvarRegistroVisita", { idTerritorio: territorioAtualId, idEndereco: enderecoAtualId, status: status, obs: obs, publicador: usuarioNome }).then(r => { if (r.erro) { mostrarNotificacao(r.erro, "erro"); } else { mostrarNotificacao("Registro salvo!"); toggleModal('modal-endereco'); abrirMapa(territorioAtualId, territorioInfoCache[territorioAtualId].nome, territorioAtualIsMeu); } });
}

// --- ADMIN & ACTIONS ---
function tendarDevolver(id) {
    var totalEnderecos = enderecosCache[id] ? enderecosCache[id].length : 0;
    var visitados = registroTrabalhoLocal[id] ? registroTrabalhoLocal[id].length : 0;
    if (visitados < totalEnderecos) { var pendentes = totalEnderecos - visitados; alert(`⛔ AÇÃO BLOQUEADA\n\nAinda existem ${pendentes} endereços sem registro.\n\nPara devolver, você deve marcar todos os endereços.`); return; }
    acionar(id, 'devolver');
}

function acionar(id, acao) {
    if (acao === 'designar') { idTerritorioParaDesignar = id; toggleModal('modal-designar'); carregarListaPublicadores(); return; }
    var texto = acao === 'devolver' ? "Confirmar devolução e arquivar histórico?" : "Deseja pedir este território?";
    confirmarAcao('Confirmação', texto, function () { mostrarNotificacao("Processando...", "sucesso"); chamarAPI("processarAcaoTerritorio", { id: id, tipoAcao: acao, email: usuarioEmail }).then(function (r) { if (r.erro) mostrarNotificacao(r.erro, "erro"); else { mostrarNotificacao(r.sucesso, "sucesso"); carregarSistema(); } }); });
}

function confirmarAcao(tit, txt, cb) {
    var containerBtns = document.querySelector('#modal-confirmacao .acoes-confirmacao');
    containerBtns.innerHTML = `<button id="confirm-sim" class="btn-azul">Sim</button><button id="confirm-nao" class="btn-azul" style="background:#eee; color:#333;">Não</button>`;
    document.getElementById('confirm-titulo').innerText = tit; document.getElementById('confirm-texto').innerText = txt;
    document.getElementById('confirm-sim').onclick = function () { toggleModal('modal-confirmacao'); cb(); };
    document.getElementById('confirm-nao').onclick = function () { toggleModal('modal-confirmacao'); };
    var modal = document.getElementById('modal-confirmacao'); if (modal.classList.contains('hidden')) { toggleModal('modal-confirmacao'); }
}

function carregarSolicitacoes() {
    chamarAPI("buscarSolicitacoes", { email: usuarioEmail }).then(lista => {
        var div = document.getElementById('lista-solicitacoes'); div.innerHTML = '';
        var badge = document.getElementById('admin-badge');
        if (!lista || !lista.length) { badge.classList.add('hidden'); div.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nada pendente.</p>'; return; }
        badge.innerText = lista.length; badge.classList.remove('hidden');
        lista.forEach((p, i) => {
            var ehTerritorio = p.tipo === "TERRITORIO";
            var icone = ehTerritorio ? 'map' : 'person_add';
            var cor = ehTerritorio ? '#f39c12' : '#3498db';
            var textoTitulo = ehTerritorio ? `Pedido: ${p.info}` : `Novo cadastro: ${p.nome}`;
            var textoSub = ehTerritorio ? p.nome : p.email;
            var html = `<div class="card-aprovacao" onclick="abrirAcaoSolicitacao('${p.email}', '${p.nome}', '${p.info}', '${p.tipo}')" style="cursor:pointer; padding:15px; margin-bottom:10px; border-left:5px solid ${cor}; background:white; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05); display:flex; align-items:center; gap:10px;"><div style="background:#f4f6f8; border-radius:50%; width:40px; height:40px; display:flex; align-items:center; justify-content:center; color:${cor};"><span class="material-icons">${icone}</span></div><div style="flex:1;"><div style="font-size:0.95rem; font-weight:bold; color:#333;">${textoTitulo}</div><div style="font-size:0.85rem; color:#666;">${textoSub}</div></div><span class="material-icons" style="color:#ccc;">chevron_right</span></div>`;
            div.innerHTML += html;
        });
    });
}

function abrirAcaoSolicitacao(email, nome, info, tipo) {
    var modal = document.getElementById('modal-confirmacao');
    var titulo = modal.querySelector('h3') || document.getElementById('confirm-titulo');
    var texto = document.getElementById('confirm-texto');
    var containerBtns = modal.querySelector('.acoes-confirmacao');

    if (modal.classList.contains('hidden')) toggleModal('modal-confirmacao');

    titulo.style.display = "flex";
    titulo.style.justifyContent = "space-between";
    titulo.style.alignItems = "center";

    var textoTitulo = (tipo === 'TERRITORIO') ? "Analisar Pedido" : "Novo Usuário";
    titulo.innerHTML = `<span>${textoTitulo}</span><button class="btn-close" onclick="toggleModal('modal-confirmacao')"><span class="material-icons">close</span></button>`;

    if (tipo === 'TERRITORIO') {
        // --- LÓGICA DE PEDIDO DE TERRITÓRIO (MANTÉM IGUAL) ---
        texto.innerHTML = `<div style="text-align:center; margin-bottom:15px;"><p style="font-size:1.1rem; color:#2c3e50; margin-bottom:5px;"><b>${nome}</b> deseja o cartão:</p><div style="font-size:1.4rem; font-weight:bold; color:#3498db; background:#f0f8ff; padding:10px; border-radius:8px; display:inline-block;">${info}</div></div><p style="color:#7f8c8d; font-size:0.9rem; margin-top:10px;">Escolha uma ação:</p>`;
        containerBtns.innerHTML = `<div style="display:flex; gap:10px; width:100%; flex-wrap:wrap; justify-content: center;"><button class="btn-verde" style="flex:1; min-width:80px;" onclick="aprovarPedido('${email}', '${info}', true)">Aprovar</button><button class="btn-azul" style="flex:1; min-width:80px;" onclick="sugerirOutro('${email}', '${info}')">Sugerir</button><button class="btn-vermelho" style="flex:1; min-width:80px;" onclick="recusarPedido('${email}', '${info}', 'TERRITORIO', true)">Recusar</button></div>`;
    } else {
        // --- LÓGICA DE CADASTRO DE USUÁRIO ---
        texto.innerHTML = `
            <div style="text-align:left; background:#f9f9f9; padding:15px; border-radius:8px; border:1px solid #eee;">
                <p style="margin:0 0 8px 0;">👤 <b>Nome:</b> ${nome}</p>
                <p style="margin:0 0 8px 0; word-break: break-all; line-height: 1.4;">📧 <b>Email:</b> <span style="color:#2980b9;">${email}</span></p>
                <p style="margin:0;">📱 <b>WhatsApp:</b> ${info}</p>
            </div>
            
            <div id="area-roles-aprovacao" style="margin-top:15px; text-align:left;">
                <label style="font-size:0.85rem; color:#666; display:block; margin-bottom:8px;">Definir Permissões:</label>
                
                <div style="display:flex; flex-direction:column; gap:8px;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:0.95rem; background:white; padding:8px; border:1px solid #eee; border-radius:4px;">
                        <input type="checkbox" value="Publicador" checked disabled> 
                        Publicador (Padrão)
                    </label>

                    <label style="display:flex; align-items:center; gap:8px; font-size:0.95rem; background:white; padding:8px; border:1px solid #eee; border-radius:4px;">
                        <input type="checkbox" value="Servo"> 
                        Servo/Dirigente
                    </label>

                    <label style="display:flex; align-items:center; gap:8px; font-size:0.95rem; background:white; padding:8px; border:1px solid #eee; border-radius:4px;">
                        <input type="checkbox" value="Editor"> 
                        Editor (Gestão Endereços)
                    </label>

                    <label style="display:flex; align-items:center; gap:8px; font-size:0.95rem; background:#fff3cd; padding:8px; border:1px solid #ffeeba; border-radius:4px;">
                        <input type="checkbox" value="Admin"> 
                        Admin (Gestão Usuários)
                    </label>
                </div>
            </div>`;

        containerBtns.innerHTML = `<div style="display:flex; gap:10px; width:100%; margin-top:15px;"><button class="btn-verde" style="flex:1;" onclick="processarAprovacaoCadastro('${email}', '${nome}', 'area-roles-aprovacao')">Aprovar</button><button class="btn-vermelho" style="flex:1;" onclick="recusarPedido('${email}', '${info}', 'CADASTRO', true)">Recusar</button></div>`;
    }
}

function aprovarPedido(email, id, modoDireto = false) {
    if (modoDireto) { if (!confirm(`Confirmar aprovação de ${id} para ${email}?`)) return; chamarAPI("aprovarPedidoTerritorio", { email: email, idTerritorio: id }).then(r => { mostrarNotificacao(r.sucesso || "Aprovado com sucesso!"); toggleModal('modal-confirmacao'); carregarSistema(); }); } else { confirmarAcao("Aprovar", "Confirmar designação?", () => chamarAPI("aprovarPedidoTerritorio", { email: email, idTerritorio: id }).then(carregarSistema)); }
}

function recusarPedido(email, info, tipo, modoDireto = false) {
    if (modoDireto) { var motivo = prompt("Motivo da recusa (opcional):", "Indisponível"); if (motivo === null) return; chamarAPI("recusarSolicitacao", { email: email, info: info, tipo: tipo, motivo: motivo }).then(() => { mostrarNotificacao("Solicitação recusada."); toggleModal('modal-confirmacao'); carregarSolicitacoes(); }); } else { chamarAPI("recusarSolicitacao", { email: email, info: info, tipo: tipo }).then(carregarSolicitacoes); }
}

function sugerirOutro(email, idAtual) {
    var modalConf = document.getElementById('modal-confirmacao'); if (!modalConf.classList.contains('hidden')) toggleModal('modal-confirmacao');
    abrirSeletorTerritorio(novoID => { if (!novoID) return; chamarAPI("sugerirTrocaTerritorio", { email: email, idAtual: idAtual, novoID: novoID }).then(() => { mostrarNotificacao("Sugestão enviada!"); carregarSolicitacoes(); }); });
}

// --- ABA 1: LISTA DE CARTÕES (Com botão de editar nome e botão de gerenciar casas) ---
function abrirGestaoTerritorios() {
    var body = document.getElementById('lista-gestao-body');
    body.innerHTML = '<div style="text-align:center; padding:20px;"><span class="material-icons" style="animation:spin 1s linear infinite;">sync</span><br>Carregando...</div>';

    chamarAPI("listarTodosTerritoriosAdmin").then(res => {
        body.innerHTML = '';
        if (!res || !res.length) { body.innerHTML = '<p>Nada encontrado.</p>'; return; }

        // Contagem rápida para exibir nos cards (opcional, se a API trouxer)

        res.forEach(t => {
            var item = document.createElement('div');
            item.className = 'item-selecao';
            // Layout do item da lista
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <div onclick="mudarAbaGestao('enderecos', '${t.id}')" style="cursor:pointer; flex:1;">
                        <div style="font-weight:bold; color:#2c3e50; font-size:1.1rem;">${t.id}</div>
                        <div style="font-size:0.85rem; color:#7f8c8d;">${t.nome}</div>
                        <div style="font-size:0.75rem; color:#3498db; margin-top:2px;">👉 Toque para ver endereços</div>
                    </div>
                    <button onclick="abrirEdicaoTerritorio('${t.id}', '${t.nome}')" style="background:#f0f0f0; border:none; border-radius:50%; width:40px; height:40px; color:#666;">
                        <span class="material-icons">edit</span>
                    </button>
                </div>`;
            body.appendChild(item);
        });
    });
}

function toggleInputOffline() {
    var isOff = document.getElementById('check-offline').checked;
    document.getElementById('sel-designar-pub').classList.toggle('hidden', isOff);
    var areaInputs = document.getElementById('area-offline-inputs'); if (areaInputs) { areaInputs.classList.toggle('hidden', !isOff); }
}

function carregarListaPublicadores() {
    chamarAPI("listarTodosUsuarios", { email: usuarioEmail }).then(res => {
        var sel = document.getElementById('sel-designar-pub'); sel.innerHTML = '<option value="">Selecione na lista...</option>';
        if (res.erro) { sel.innerHTML = '<option value="">Erro ao carregar</option>'; return mostrarNotificacao(res.erro, "erro"); }
        var listaOrdenada = (res.usuarios || []).sort((a, b) => a.nome.localeCompare(b.nome));
        listaOrdenada.forEach(u => { var temApp = u.email && u.email.includes('@'); var icone = temApp ? '📱' : '📄'; var textoExtra = temApp ? '' : ' (Sem App)'; var option = document.createElement('option'); option.value = temApp ? u.email : u.nome; option.innerText = `${icone} ${u.nome}${textoExtra}`; sel.appendChild(option); });
        var labelCheck = document.getElementById('lbl-check-offline'); if (labelCheck) { labelCheck.innerText = "Registrar Publicador sem App"; }
        document.getElementById('btn-confirmar-designacao').onclick = finalizarDesignacao;
    });
}

function finalizarDesignacao() {
    var checkNovoOffline = document.getElementById('check-offline').checked;
    var valorSelecionado = document.getElementById('sel-designar-pub').value;
    var emailFinal = ""; var nomeOfflineFinal = "";
    if (checkNovoOffline) {
        var nomeOff = document.getElementById('input-offline-nome').value.trim(); var sobreOff = document.getElementById('input-offline-sobrenome') ? document.getElementById('input-offline-sobrenome').value.trim() : "";
        if (!nomeOff || !sobreOff) { return mostrarNotificacao("Preencha Nome e Sobrenome.", "erro"); }
        nomeOfflineFinal = nomeOff + " " + sobreOff;
    } else {
        if (!valorSelecionado) { return mostrarNotificacao("Selecione um publicador.", "erro"); }
        if (valorSelecionado.includes('@')) { emailFinal = valorSelecionado; } else { nomeOfflineFinal = valorSelecionado; }
    }
    var payload = { id: idTerritorioParaDesignar, tipoAcao: "designar", email: emailFinal };
    if (nomeOfflineFinal) { payload.nomeOffline = nomeOfflineFinal; }
    chamarAPI("processarAcaoTerritorio", payload).then(r => { if (r.erro) { mostrarNotificacao(r.erro, "erro"); } else { mostrarNotificacao(r.sucesso || "Designado com sucesso!"); toggleModal('modal-designar'); carregarSistema(); document.getElementById('input-offline-nome').value = ""; if (document.getElementById('input-offline-sobrenome')) document.getElementById('input-offline-sobrenome').value = ""; document.getElementById('check-offline').checked = false; toggleInputOffline(); } });
}

function filtrarListaEdicao(v) { document.querySelectorAll('#lista-gestao-body .item-selecao').forEach(i => i.style.display = i.innerText.toLowerCase().includes(v.toLowerCase()) ? 'flex' : 'none'); }


// --- FORMULÁRIO E MODAIS AUXILIARES ---

function abrirEdicaoTerritorio(id, nome) {
    var modalPequeno = document.getElementById('modal-editar-territorio');
    document.getElementById('edit-terr-id').innerText = id;
    document.getElementById('edit-terr-nome').value = nome;
    modalPequeno.classList.remove('hidden');
}

function fecharModalEdicaoTerritorio() {
    document.getElementById('modal-editar-territorio').classList.add('hidden');
}

function salvarEdicaoTerritorio() {
    var id = document.getElementById('edit-terr-id').innerText;
    var novoNome = document.getElementById('edit-terr-nome').value;
    mostrarNotificacao("Salvando...", "sucesso");

    chamarAPI("salvarDadosTerritorio", { idTerritorio: id, novoNome: novoNome }).then(res => {
        mostrarNotificacao("Nome atualizado!");
        fecharModalEdicaoTerritorio();
        carregarListaTerritoriosGestao();
    });
}


function abrirGestaoUsuarios() { toggleModal('modal-perfil'); toggleModal('modal-users'); chamarAPI("listarTodosUsuarios", { email: usuarioEmail }).then(res => { var body = document.getElementById('lista-users-body'); body.innerHTML = ''; if (!res.usuarios) return; res.usuarios.forEach(u => body.innerHTML += `<div class="item-usuario"><div><b>${u.nome}</b><br><small>${u.email}</small><br><div class="tags-roles" style="margin-top:5px;">${u.nivel.split(',').map(n => `<span>${n.trim()}</span>`).join('')}</div></div><button class="icon-btn" onclick="abrirModalEdicao('${u.email}', '${u.nome}', '${u.nivel}')"><span class="material-icons">edit</span></button></div>`); }); }


function abrirModalEdicao(email, nome, nivel) {
    emailUsuarioEdicao = email;
    document.getElementById('edit-user-nome').innerText = nome;

    // 1. Reseta todos os checkboxes
    ['role-publicador', 'role-servo', 'role-admin', 'role-editor'].forEach(id => {
        var el = document.getElementById(id);
        if (el) el.checked = false;
    });

    var roles = nivel.toLowerCase();

    // 2. Marca as caixas baseadas no que o usuário já é
    if (roles.includes('publicador')) document.getElementById('role-publicador').checked = true;

    // Servo OU Dirigente marcam a mesma caixa agora
    if (roles.includes('servo') || roles.includes('dirigente')) document.getElementById('role-servo').checked = true;

    if (roles.includes('editor')) document.getElementById('role-editor').checked = true;

    if (roles.includes('admin')) document.getElementById('role-admin').checked = true;

    toggleModal('modal-editar-usuario');
}

function salvarEdicaoViaModal() {
    if (!emailUsuarioEdicao) return;

    var checks = [];

    // Verifica quais caixas estão marcadas
    if (document.getElementById('role-publicador').checked) checks.push("Publicador");

    // Se marcou Servo, salvamos como "Servo" (que no sistema vale para Servo e Dirigente)
    if (document.getElementById('role-servo').checked) checks.push("Servo");

    if (document.getElementById('role-editor').checked) checks.push("Editor");

    if (document.getElementById('role-admin').checked) checks.push("Admin");

    // Validação: Se desmarcar tudo, pergunta se quer excluir
    if (checks.length === 0) {
        if (confirm("Nenhuma função selecionada. Deseja EXCLUIR este usuário do sistema?")) {
            chamarAPI("excluirUsuario", { adminEmail: usuarioEmail, emailAlvo: emailUsuarioEdicao })
                .then(() => {
                    toggleModal('modal-editar-usuario');
                    abrirGestaoUsuarios();
                });
        }
        return;
    }

    // Salva
    chamarAPI("salvarEdicaoUsuario", {
        adminEmail: usuarioEmail,
        emailAlvo: emailUsuarioEdicao,
        novosPapeis: checks.join(", ")
    }).then(() => {
        mostrarNotificacao("Permissões atualizadas!", "sucesso");
        toggleModal('modal-editar-usuario');
        abrirGestaoUsuarios(); // Recarrega a lista
    });
}

function processarAprovacaoCadastro(email, nome, idContainer) { var checks = document.querySelectorAll(`#${idContainer} input:checked`); if (!checks.length) return mostrarNotificacao("Selecione um papel.", "erro"); var papeis = Array.from(checks).map(c => c.value).join(", "); confirmarAcao("Aprovar", `Aprovar ${nome} como ${papeis}?`, () => { chamarAPI("aprovarCadastro", { adminEmail: usuarioEmail, emailAlvo: email, nomeAlvo: nome, nivel: papeis }).then(() => { mostrarNotificacao("Aprovado!"); carregarSolicitacoes(); }); }); }
function abrirSeletorTerritorio(cb) { window.callbackSelecao = cb; toggleModal('modal-selecao'); document.getElementById('corpo-selecao').innerHTML = '<p style="text-align:center">Carregando...</p>'; chamarAPI("listarTodosTerritoriosAdmin").then(res => { var body = document.getElementById('corpo-selecao'); body.innerHTML = ''; res.forEach(t => { var extraInfo = t.status === 'Ocupado' ? (t.dataEntrega || t.data ? `<span style="font-size:0.8rem; color:#e74c3c;">Prev. Entrega: ${t.dataEntrega || t.data}</span>` : '<span style="font-size:0.8rem; color:#e74c3c;">Ocupado</span>') : '<span style="font-size:0.8rem; color:#27ae60;">Livre</span>'; body.innerHTML += `<div class="item-selecao" onclick="toggleModal('modal-selecao'); window.callbackSelecao('${t.id}')"><div><b>${t.id}</b> - ${t.nome}</div><div>${extraInfo}</div></div>`; }); }); }

function enviarSolicitacao() {
    var nome = document.getElementById('cad-nome').value.trim();
    var inputSobrenome = document.getElementById('cad-sobrenome');
    var sobrenome = inputSobrenome ? inputSobrenome.value.trim() : "";
    var tel = document.getElementById('cad-tel').value.trim();
    if (!nome || !tel) return mostrarNotificacao("Preencha Nome e WhatsApp.", "erro");
    mostrarNotificacao("Enviando...", "sucesso");
    chamarAPI("solicitarCadastro", { nome: nome, sobrenome: sobrenome, tel: tel, email: usuarioEmail }).then(r => { if (r.erro) { mostrarNotificacao(r.erro, "erro"); } else { mostrarNotificacao("Solicitação enviada!", "sucesso"); navegarPara('tela-pendente'); } });
}

// --- GESTÃO DE DADOS INTEGRADA ---

var cacheEnderecosGestao = [];
var cacheTerritoriosLista = [];
var contagemPorTerritorio = {};

function abrirGestaoTerritorios() {
    var modal = document.getElementById('modal-gestao-lista');
    if (modal.classList.contains('hidden')) { toggleModal('modal-gestao-lista'); }
    mudarAbaGestao('territorios');
}

function mudarAbaGestao(aba, territorioPreSelecionado = null) {
    // 1. Reseta visual dos botões (Aba ativa/inativa)
    document.querySelectorAll('.tab-gestao').forEach(t => {
        t.style.borderBottom = 'none';
        t.style.color = '#999';
        t.classList.remove('active');
    });

    var idBtn = aba === 'territorios' ? 'tab-terr' : 'tab-end';
    var btn = document.getElementById(idBtn);
    if (btn) {
        btn.style.borderBottom = '4px solid #3498db';
        btn.style.color = '#3498db';
        btn.classList.add('active');
    }

    // 2. Troca de Visão e RESET DE SCROLL (O Pulo do Gato)
    if (aba === 'territorios') {
        document.getElementById('view-gestao-territorios').classList.remove('hidden');
        document.getElementById('view-gestao-enderecos').classList.add('hidden');

        // --- CORREÇÃO DE TRAVAMENTO ---
        // Força a rolagem voltar ao topo ao abrir a aba
        var viewTerr = document.getElementById('view-gestao-territorios');
        if (viewTerr) viewTerr.scrollTop = 0;

        carregarListaTerritoriosGestao();
    } else {
        document.getElementById('view-gestao-territorios').classList.add('hidden');
        document.getElementById('view-gestao-enderecos').classList.remove('hidden');

        // --- CORREÇÃO DE TRAVAMENTO ---
        // Força a rolagem voltar ao topo
        var viewEnd = document.getElementById('view-gestao-enderecos');
        if (viewEnd) viewEnd.scrollTop = 0;

        // Se vier com ID (clique no cartão), passa para a função carregar
        carregarGestaoEnderecos(territorioPreSelecionado);
    }
}

// --- ABA 1: CARTÕES (Melhorada com Ações Diretas) ---
function carregarListaTerritoriosGestao() {
    var body = document.getElementById('lista-gestao-body');
    body.innerHTML = '<div style="text-align:center; padding:20px;"><span class="material-icons" style="animation:spin 1s linear infinite;">sync</span><br>Carregando...</div>';

    // Precisamos carregar os endereços também para saber a contagem correta
    Promise.all([
        chamarAPI("listarTodosTerritoriosAdmin"),
        chamarAPI("listarTodosEnderecosSimples")
    ]).then(([resTerr, resEnd]) => {
        body.innerHTML = '';
        if (!resTerr || !resTerr.length) { body.innerHTML = '<p>Nada encontrado.</p>'; return; }

        // Mapa de contagem
        var contagem = {};
        (resEnd.enderecos || []).forEach(e => {
            if (!contagem[e.terr]) contagem[e.terr] = 0;
            contagem[e.terr]++;
        });

        resTerr.forEach(t => {
            var qtd = contagem[t.id] || 0;
            var corQtd = qtd >= 6 ? '#e74c3c' : '#27ae60';
            var item = document.createElement('div');
            item.className = 'item-selecao';
            item.style.flexDirection = 'column'; // Layout vertical para caber botões
            item.style.alignItems = 'flex-start';

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-bottom:10px;">
                    <div>
                        <div style="font-weight:bold; color:#2c3e50; font-size:1.1rem;">${t.id}</div>
                        <div style="font-size:0.85rem; color:#7f8c8d;">${t.nome}</div>
                        <div style="font-size:0.8rem; font-weight:bold; color:${corQtd}; margin-top:2px;">
                            ${qtd}/6 Endereços
                        </div>
                    </div>
                    <button onclick="abrirEdicaoTerritorio('${t.id}', '${t.nome}')" style="background:#f0f0f0; border:none; border-radius:50%; width:40px; height:40px; color:#666;">
                        <span class="material-icons">edit</span>
                    </button>
                </div>
                
                <div style="display:flex; gap:10px; width:100%; border-top:1px solid #eee; padding-top:10px;">
                    <button class="btn-azul" style="flex:1; font-size:0.8rem; padding:8px;" onclick="mudarAbaGestao('enderecos', '${t.id}')">
                        <span class="material-icons" style="font-size:16px;">list</span> Ver Lista
                    </button>
                    <button class="btn-verde" style="flex:1; font-size:0.8rem; padding:8px;" onclick="adicionarEnderecoDireto('${t.id}')">
                        <span class="material-icons" style="font-size:16px;">add</span> + Endereço
                    </button>
                </div>
            `;
            body.appendChild(item);
        });
    });
}

// --- ABA 2: ENDEREÇOS (Com Busca por Bairro) ---
function carregarGestaoEnderecos(filtroId = null) {
    fecharFormularioGestao();
    var divLista = document.getElementById('lista-enderecos-gestao');
    divLista.innerHTML = '<div style="text-align:center; padding:20px;"><span class="material-icons" style="animation:spin 1s linear infinite;">sync</span><br>Buscando dados...</div>';

    Promise.all([
        chamarAPI("listarTodosTerritoriosAdmin"),
        chamarAPI("listarTodosEnderecosSimples")
    ]).then(([resTerr, resEnd]) => {
        // Verifica erros vindos da API (ex: Coluna não encontrada)
        if (resTerr.erro || resEnd.erro) {
            throw new Error(resTerr.erro || resEnd.erro);
        }

        // Blindagem contra dados nulos
        cacheTerritoriosLista = resTerr.mapas || (Array.isArray(resTerr) ? resTerr : []);
        cacheEnderecosGestao = resEnd.enderecos || [];

        contagemPorTerritorio = {};

        // Loop seguro (evita crash se a lista vier vazia/quebrada)
        if (Array.isArray(cacheEnderecosGestao)) {
            cacheEnderecosGestao.forEach(e => {
                if (e && e.terr) {
                    if (!contagemPorTerritorio[e.terr]) contagemPorTerritorio[e.terr] = 0;
                    contagemPorTerritorio[e.terr]++;
                }
            });
        }

        atualizarSelectTerritorios('edit-end-territorio');

        if (filtroId) {
            document.getElementById('edit-end-territorio').value = filtroId;
            document.getElementById('busca-endereco-gestao').value = filtroId;
            filtrarEnderecosGestao();
        } else {
            renderizarListaEnderecosGestao(cacheEnderecosGestao);
        }
    }).catch(err => {
        console.error("ERRO DETALHADO:", err);
        // MOSTRA O ERRO REAL NA TELA
        divLista.innerHTML = `<div style="text-align:center; padding:20px; color:red;">
            <span class="material-icons">error</span><br>
            <b>Ocorreu um erro:</b><br>
            ${err.message || err.toString()}
        </div>`;

        // Destrava o dropdown
        var select = document.getElementById('edit-end-territorio');
        if (select) select.innerHTML = '<option value="">Erro ao carregar</option>';
    });
}


// --- FUNÇÃO QUE ESTAVA FALTANDO ---
function atualizarSelectTerritorios(idSelect) {
    var select = document.getElementById(idSelect);
    if (!select) return;

    var valorAtual = select.value; // Tenta guardar o que estava selecionado

    select.innerHTML = '<option value="">-- Sem Território --</option>';

    // Proteção se a lista estiver vazia
    if (!cacheTerritoriosLista || !Array.isArray(cacheTerritoriosLista)) {
        return;
    }

    cacheTerritoriosLista.forEach(t => {
        var qtd = contagemPorTerritorio[t.id] || 0;
        var status = qtd >= 6 ? '(CHEIO)' : `(${qtd}/6)`;

        var option = document.createElement("option");
        option.value = t.id;
        option.text = `${t.id} - ${t.nome} ${status}`;

        // Opcional: pinta de vermelho se estiver cheio
        if (qtd >= 6) option.style.color = 'red';

        select.appendChild(option);
    });

    // Restaura seleção se possível
    if (valorAtual) select.value = valorAtual;
}

function renderizarListaEnderecosGestao(lista) {
    var div = document.getElementById('lista-enderecos-gestao');
    div.innerHTML = '';

    if (!lista || lista.length === 0) {
        div.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nenhum endereço encontrado.</p>';
        return;
    }

    // [CORREÇÃO AQUI]: Converte para texto antes de ordenar para não travar
    lista.sort((a, b) => String(a.terr || '').localeCompare(String(b.terr || '')));

    lista.slice(0, 100).forEach(end => {
        var item = document.createElement('div');
        item.className = 'card-endereco-gestao';
        item.onclick = () => preencherFormularioGestao(end);

        var localHtml = '';
        if (end.bairro) localHtml += ` • ${end.bairro}`;

        item.innerHTML = `
            <div style="flex:1;">
                <div style="font-size:0.75rem; color:#3498db; font-weight:bold; text-transform:uppercase; margin-bottom:4px;">
                    <span class="material-icons" style="font-size:12px; vertical-align:middle;">map</span> ${end.terr}${localHtml}
                </div>
                <div style="font-size:1.1rem; color:#2c3e50; font-weight:bold;">${end.rua}, ${end.num}</div>
                <div style="font-size:0.85rem; color:#7f8c8d;">${end.ref || 'Sem referência'}</div>
            </div>
            <div style="text-align:right;">
                 <span class="material-icons" style="color:#bdc3c7;">edit</span>
            </div>
        `;
        div.appendChild(item);
    });
}

function filtrarEnderecosGestao() {
    var termo = document.getElementById('busca-endereco-gestao').value.toLowerCase();

    // ATUALIZADO: Agora busca também pelo BAIRRO
    var filtrados = cacheEnderecosGestao.filter(e =>
        e.rua.toLowerCase().includes(termo) ||
        e.terr.toLowerCase().includes(termo) ||
        (e.num && e.num.toString().includes(termo)) ||
        (e.bairro && e.bairro.toLowerCase().includes(termo))
    );
    renderizarListaEnderecosGestao(filtrados);
}

// --- AÇÕES DIRETAS (NOVO) ---
function adicionarEnderecoDireto(idTerritorio) {
    mudarAbaGestao('enderecos'); // Vai para a aba de formulário
    // Pequeno delay para a aba carregar e o formulário estar disponível
    setTimeout(() => {
        prepararNovoEndereco();
        document.getElementById('edit-end-territorio').value = idTerritorio; // Já seleciona o cartão
        verificarLotacaoTerritorio(idTerritorio);
        // Tenta focar no campo Rua para agilizar
        document.getElementById('edit-end-rua').focus();
    }, 300);
}

// ... (Mantenha atualizarSelectTerritorios, prepararNovoEndereco, preencherFormularioGestao, salvar etc.) ...
// O restante das funções auxiliares continua igual ao código anterior

// --- Lógica do Formulário ---

function prepararNovoEndereco() {
    limparFormEndereco();
    document.getElementById('form-gestao-endereco').classList.remove('hidden');

    // --- NOVO: Esconde o botão de excluir ---
    var btnExcluir = document.getElementById('btn-excluir-endereco');
    if (btnExcluir) btnExcluir.classList.add('hidden'); // Esconde ao criar novo
    // ----------------------------------------

    document.getElementById('edit-end-cidade').value = "";

    var filtroAtual = document.getElementById('edit-end-territorio').value;
    if (filtroAtual) {
        verificarLotacaoTerritorio(filtroAtual);
    }
    document.getElementById('view-gestao-enderecos').scrollTop = 0;
}


// ======================================================
// LÓGICA DE EXCLUSÃO COM CONFIRMAÇÃO DETALHADA
// ======================================================

function excluirEnderecoAtual() {
    var id = document.getElementById('edit-end-id').value;
    if (!id) return mostrarNotificacao("Erro: ID inválido.", "erro");

    // Pega os dados visuais para mostrar no resumo
    var rua = document.getElementById('edit-end-rua').value;
    var num = document.getElementById('edit-end-numero').value;
    var bairro = document.getElementById('edit-end-bairro').value;

    // 1. Configura o Modal
    var modal = document.getElementById('modal-confirmacao');
    var titulo = document.getElementById('confirm-titulo');
    var texto = document.getElementById('confirm-texto');
    var btnSim = document.getElementById('confirm-sim');

    if (modal.classList.contains('hidden')) toggleModal('modal-confirmacao');

    titulo.innerText = "Excluir Endereço";

    // Resumo bonito para Exclusão
    texto.innerHTML = `
        <div style="text-align:center; color:#e74c3c; margin-bottom:15px;">
            <span class="material-icons" style="font-size:48px;">delete_forever</span><br>
            <b style="font-size:1.1rem;">ATENÇÃO!</b><br>
            <span style="font-size:0.85rem;">Isso não pode ser desfeito.</span>
        </div>
        <div style="background:#fff5f5; padding:15px; border-radius:8px; border:1px solid #ffcccc; font-size:0.9rem; text-align:left; word-wrap: break-word;">
            <p><strong>Rua:</strong> ${rua}</p>
            <p><strong>Número:</strong> ${num}</p>
            <p><strong>Bairro:</strong> ${bairro}</p>
        </div>
        <p style="margin-top:15px; font-size:0.9rem; text-align:center;">Deseja realmente apagar este registro?</p>
    `;

    // 2. Define ação do SIM
    var novoBtnSim = btnSim.cloneNode(true);
    btnSim.parentNode.replaceChild(novoBtnSim, btnSim);

    novoBtnSim.onclick = function () {
        toggleModal('modal-confirmacao');
        executarExclusaoReal(id);
    };
}

function executarExclusaoReal(id) {
    var btnExcluir = document.getElementById('btn-excluir-endereco');
    var textoOriginal = btnExcluir.innerHTML;

    btnExcluir.disabled = true;
    btnExcluir.innerHTML = '<span class="material-icons" style="animation:spin 1s infinite linear">sync</span> Excluindo...';

    chamarAPI("excluirEndereco", { idEndereco: id }).then(res => {
        btnExcluir.disabled = false;
        btnExcluir.innerHTML = textoOriginal;

        if (res.erro) {
            mostrarNotificacao(res.erro, "erro");
        } else {
            mostrarNotificacao("Endereço excluído!", "sucesso");
            fecharFormularioGestao();
            carregarGestaoEnderecos();
        }
    });
}



function preencherFormularioGestao(end) {
    document.getElementById('form-gestao-endereco').classList.remove('hidden');
    document.getElementById('edit-end-id').value = end.id;

    // --- NOVO: Mostra o botão de excluir ---
    var btnExcluir = document.getElementById('btn-excluir-endereco');
    if (btnExcluir) {
        btnExcluir.classList.remove('hidden'); // Remove a classe que esconde
        btnExcluir.style.display = "flex"; // Força o display flex para alinhar ícone
    }
    // ------------------------------------

    // --- 1. LÓGICA DE LOCALIZAÇÃO (VISUAL LIMPO) ---
    var cidadeSalva = end.cidade || "";
    var estadoDetectado = "RJ";
    var cidadeDetectada = cidadeSalva;

    // Separa Cidade e Estado
    if (cidadeSalva.includes("-")) {
        var partes = cidadeSalva.split("-");
        cidadeDetectada = partes[0].trim();
        if (partes.length > 1) estadoDetectado = partes[1].trim().toUpperCase();
    }

    // A. ESTADO
    var selEstado = document.getElementById('edit-end-estado');
    if (selEstado) {
        // Carrega a lista original primeiro
        popularSelect("edit-end-estado", Object.keys(cacheLocais), true);

        // Verifica se o estado do endereço está na lista
        var existeEstado = Array.from(selEstado.options).some(opt => opt.value === estadoDetectado);

        if (!existeEstado && estadoDetectado) {
            // Se não existe (ex: MG), CRIA a opção visualmente para ficar bonito dentro do select
            var opt = document.createElement('option');
            opt.value = estadoDetectado;
            opt.text = estadoDetectado;
            // Insere logo após o "Selecione"
            selEstado.add(opt, 1);
        }

        selEstado.value = estadoDetectado;
        verificarEstadoNovo(estadoDetectado); // Garante que o input text fique oculto

        // Força carregamento das cidades
        carregarCidades(estadoDetectado);
    }

    // B. CIDADE
    var selCidade = document.getElementById('edit-end-cidade');
    if (selCidade) {
        // Verifica se a cidade está na lista carregada
        var existeCidade = Array.from(selCidade.options).some(opt => opt.value === cidadeDetectada);

        if (!existeCidade && cidadeDetectada) {
            // Adiciona a cidade atual na lista para não ficar "em branco" ou no campo "novo"
            var opt = document.createElement('option');
            opt.value = cidadeDetectada;
            opt.text = cidadeDetectada;
            selCidade.add(opt, 1);
        }

        selCidade.value = cidadeDetectada;
        verificarCidadeNovo(cidadeDetectada); // Esconde input text

        // Força carregamento dos bairros
        carregarBairros(cidadeDetectada);
    }

    // C. BAIRRO (A correção principal que você pediu)
    var selBairro = document.getElementById('edit-end-bairro');
    if (selBairro) {
        var bairroSalvo = (end.bairro || "").trim();

        // Procura ignorando maiúsculas/minúsculas para evitar duplicidade
        var match = Array.from(selBairro.options).find(opt => opt.value.toLowerCase() === bairroSalvo.toLowerCase());

        if (match) {
            // Se achou (mesmo com case diferente), usa o valor da lista
            selBairro.value = match.value;
        } else if (bairroSalvo !== "") {
            // SE NÃO ACHOU NA LISTA: Adiciona DENTRO DA SETINHA ao invés de jogar pro input
            var opt = document.createElement('option');
            opt.value = bairroSalvo;
            opt.text = bairroSalvo;
            // Adiciona no topo da lista (abaixo do "Selecione")
            selBairro.add(opt, 1);

            // Seleciona ele
            selBairro.value = bairroSalvo;
        }

        // IMPORTANTE: Isso garante que o campo de digitar "Novo Bairro" fique oculto
        // pois agora temos um valor válido selecionado no dropdown.
        verificarBairroNovo(selBairro.value);

        // Limpa o input oculto para garantir
        document.getElementById('input-bairro-novo').value = "";
    }
    // -------------------------------------------------------

    // Preenche o restante dos dados
    document.getElementById('edit-end-territorio').value = end.terr;
    document.getElementById('edit-end-rua').value = end.rua;
    document.getElementById('edit-end-numero').value = end.num;
    document.getElementById('edit-end-ref').value = end.ref || "";
    document.getElementById('edit-end-lat').value = end.lat || "";
    document.getElementById('edit-end-lng').value = end.lng || "";

    verificarLotacaoTerritorio(end.terr);

    // Rola para o topo
    var container = document.getElementById('view-gestao-enderecos');
    if (container) container.scrollTop = 0;
}


function fecharFormularioGestao() {
    document.getElementById('form-gestao-endereco').classList.add('hidden');
    limparFormEndereco();
}

function pegarLocalizacaoAtual() {
    if (!navigator.geolocation) return alert("GPS não ativado.");
    mostrarNotificacao("Buscando GPS...", "sucesso");
    navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('edit-end-lat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('edit-end-lng').value = pos.coords.longitude.toFixed(6);
        mostrarNotificacao("Coordenadas atualizadas!", "sucesso");
    }, () => alert("Erro ao obter localização."));
}

function limparFormEndereco() {
    document.getElementById('edit-end-id').value = "";
    document.getElementById('edit-end-territorio').value = "";
    document.getElementById('edit-end-bairro').value = ""; // Limpar bairro
    document.getElementById('edit-end-rua').value = "";
    document.getElementById('edit-end-numero').value = "";
    document.getElementById('edit-end-ref').value = "";
    document.getElementById('edit-end-lat').value = "";
    document.getElementById('edit-end-lng').value = "";
    document.getElementById('msg-lotacao').innerText = "";
}

function verificarLotacaoTerritorio(terrId) {
    if (!terrId) { document.getElementById('msg-lotacao').innerText = ""; return; }

    var qtd = contagemPorTerritorio[terrId] || 0;
    var el = document.getElementById('msg-lotacao');
    var editando = document.getElementById('edit-end-id').value;

    // Se já tem 6 e estamos criando um novo (não editando um existente desse territorio)
    if (qtd >= 6 && !editando) {
        el.innerText = `⚠️ ATENÇÃO: ${terrId} já tem 6 endereços!`;
        el.style.color = "#e74c3c";
    } else {
        el.innerText = `Cartão ${terrId}: ${qtd}/6 ocupados.`;
        el.style.color = "#27ae60";
    }
}



// ======================================================
// LÓGICA DE SALVAR COM CONFIRMAÇÃO DETALHADA
// ======================================================

function confirmarSalvarEndereco() {
    // 1. Coleta e Validação (Igual fazia antes)
    var id = document.getElementById('edit-end-id').value;

    // Lógica Estado
    var estado = document.getElementById('edit-end-estado').value;
    if (estado === "NOVO_CUSTOM") estado = document.getElementById('input-estado-novo').value.trim().toUpperCase();

    // Lógica Cidade
    var cidade = document.getElementById('edit-end-cidade').value;
    if (cidade === "NOVO_CUSTOM") cidade = document.getElementById('input-cidade-novo').value.trim();

    // Lógica Bairro
    var bairro = document.getElementById('edit-end-bairro').value;
    if (bairro === "NOVO_CUSTOM") bairro = document.getElementById('input-bairro-novo').value.trim();

    var rua = document.getElementById('edit-end-rua').value;
    var numero = document.getElementById('edit-end-numero').value;
    var ref = document.getElementById('edit-end-ref').value;
    var terr = document.getElementById('edit-end-territorio').value;

    if (!estado || !cidade || !bairro) return mostrarNotificacao("Preencha Estado, Cidade e Bairro.", "erro");
    if (!rua) return mostrarNotificacao("A rua é obrigatória.", "erro");
    if (!terr) return mostrarNotificacao("Selecione o Território.", "erro");

    // Objeto de dados pronto
    var dadosParaSalvar = {
        idEndereco: id,
        cidade: `${cidade} - ${estado}`,
        bairro: bairro,
        idTerritorio: terr,
        rua: rua,
        numero: numero,
        referencia: ref,
        lat: document.getElementById('edit-end-lat').value,
        lng: document.getElementById('edit-end-lng').value
    };

    // 2. Configura o Modal de Confirmação
    var modal = document.getElementById('modal-confirmacao');
    var titulo = document.getElementById('confirm-titulo');
    var texto = document.getElementById('confirm-texto');
    var btnSim = document.getElementById('confirm-sim');

    if (modal.classList.contains('hidden')) toggleModal('modal-confirmacao');

    titulo.innerText = id ? "Confirmar Edição" : "Confirmar Novo Endereço";

    // Resumo dos dados que serão salvos
    texto.innerHTML = `
        <div style="text-align:left; background:#f9f9f9; padding:15px; border-radius:8px; border:1px solid #eee; font-size:0.9rem; word-wrap: break-word; overflow-y: auto; max-height: 60vh;">
            <p style="margin-bottom:5px;"><strong>Território:</strong> ${terr}</p>
            <p style="margin-bottom:5px;"><strong>Cidade/Bairro:</strong> ${cidade} - ${bairro}</p>
            <hr style="margin:10px 0; border:0; border-top:1px solid #ddd;">
            <p style="margin-bottom:5px;"><strong>Rua:</strong> <span style="color:#2980b9; font-weight:bold;">${rua}</span></p>
            <p style="margin-bottom:5px;"><strong>Número:</strong> ${numero}</p>
            <p style="margin-bottom:0;"><strong>Ref:</strong> ${ref || '---'}</p>
        </div>
        <p style="margin-top:15px; text-align:center; font-weight:500; color:#555;">Confirmar estes dados?</p>
    `;

    // 3. Define a ação do botão SIM (Passando os dados)
    // Clonamos o botão para limpar eventos anteriores
    var novoBtnSim = btnSim.cloneNode(true);
    btnSim.parentNode.replaceChild(novoBtnSim, btnSim);

    novoBtnSim.onclick = function () {
        toggleModal('modal-confirmacao'); // Fecha modal
        executarSalvarReal(dadosParaSalvar); // Chama a função que salva de verdade
    };
}

function executarSalvarReal(dados) {
    // Feedback visual no botão SALVAR
    var btnSalvar = document.getElementById('btn-salvar-endereco');
    // Se não achar pelo ID (caso não tenha colocado id no html), tenta querySelector
    if (!btnSalvar) btnSalvar = document.querySelector('#form-gestao-endereco .btn-verde');

    var textoOriginal = btnSalvar.innerHTML;

    btnSalvar.disabled = true;
    btnSalvar.innerHTML = '<span class="material-icons" style="font-size:16px; animation:spin 1s infinite linear">sync</span> Salvando...';

    chamarAPI("salvarEnderecoGestao", dados).then(res => {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = textoOriginal;

        if (res.erro) {
            mostrarNotificacao(res.erro, "erro");
        } else {
            mostrarNotificacao("Registro salvo com sucesso!", "sucesso");
            fecharFormularioGestao();

            // Lógica de limpar cache se for bairro novo
            if (document.getElementById('input-bairro-novo').value) {
                cacheLocais = {};
                carregarDadosLocais();
            }
            carregarGestaoEnderecos();
        }
    }).catch(err => {
        btnSalvar.disabled = false;
        btnSalvar.innerHTML = textoOriginal;
        mostrarNotificacao("Erro de conexão.", "erro");
    });
}


// --- LÓGICA DE LOCALIZAÇÃO (ESTADO/CIDADE/BAIRRO) ---

var cacheLocais = {};

function carregarDadosLocais() {
    if (Object.keys(cacheLocais).length > 0) return;
    console.log("Tentando carregar hierarquia de locais...");

    chamarAPI("listarHierarquiaLocais").then(r => {
        if (r.hierarquia) {
            cacheLocais = r.hierarquia;
            var sel = document.getElementById("edit-end-estado");
            // MUDANÇA: 'true' no final habilita o "Cadastrar Novo..."
            if (sel) popularSelect("edit-end-estado", Object.keys(cacheLocais), true);
        } else {
            console.warn("Aviso: Hierarquia vazia.", r);
        }
    }).catch(err => console.error("Erro ao carregar locais:", err));
}

function carregarCidades(estado) {
    // Se o estado for "Novo", não tem lista de cidades, mas limpamos o select
    var selCidade = document.getElementById('edit-end-cidade');
    var selBairro = document.getElementById('edit-end-bairro');

    selCidade.innerHTML = '<option value="">Selecione...</option>';
    selBairro.innerHTML = '<option value="">Selecione a Cidade...</option>';

    var listaCidades = [];
    // Só busca a lista se o estado existir no cache (não for "NOVO_CUSTOM")
    if (estado && cacheLocais[estado]) {
        listaCidades = Object.keys(cacheLocais[estado]);
    }

    // MUDANÇA: Passamos 'true' para permitir cadastrar nova cidade
    popularSelect("edit-end-cidade", listaCidades, true);
}

function carregarBairros(cidade) {
    var estado = document.getElementById('edit-end-estado').value;
    var selBairro = document.getElementById('edit-end-bairro');

    selBairro.innerHTML = '<option value="">Selecione...</option>';

    var listaBairros = [];
    if (estado && cidade && cacheLocais[estado] && cacheLocais[estado][cidade]) {
        listaBairros = cacheLocais[estado][cidade];
    }

    // MUDANÇA: Passamos 'true' para permitir cadastrar novo bairro
    popularSelect("edit-end-bairro", listaBairros, true);
}

function popularSelect(id, lista, comOpcaoNovo = false) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>';

    lista.forEach(item => {
        var opt = document.createElement('option');
        opt.value = item;
        opt.text = item;
        sel.appendChild(opt);
    });

    if (comOpcaoNovo) {
        var opt = document.createElement('option');
        opt.value = "NOVO_CUSTOM";
        opt.text = "➕ Cadastrar Novo...";
        opt.style.fontWeight = "bold";
        opt.style.color = "#2980b9";
        sel.appendChild(opt);
    }
}

// --- NOVAS FUNÇÕES DE VERIFICAÇÃO ---

function verificarEstadoNovo(val) {
    var input = document.getElementById('input-estado-novo');
    if (val === "NOVO_CUSTOM") {
        input.classList.remove('hidden');
        input.focus();
        // Se escolheu estado novo, reseta cidade para "Novo" ou vazio
        carregarCidades(null);
    } else {
        input.classList.add('hidden');
        input.value = "";
    }
}

function verificarCidadeNovo(val) {
    var input = document.getElementById('input-cidade-novo');
    if (val === "NOVO_CUSTOM") {
        input.classList.remove('hidden');
        input.focus();
        // Se escolheu cidade nova, reseta bairro
        carregarBairros(null);
    } else {
        input.classList.add('hidden');
        input.value = "";
    }
}

function verificarBairroNovo(val) {
    var input = document.getElementById('input-bairro-novo');
    if (val === "NOVO_CUSTOM") {
        input.classList.remove('hidden');
        input.focus();
    } else {
        input.classList.add('hidden');
        input.value = "";
    }
}


// --- ATUALIZAÇÃO DA FUNÇÃO SALVAR ---
// Substitua a função salvarEnderecoGestao antiga por esta:
function salvarEnderecoGestao() {
    var id = document.getElementById('edit-end-id').value;

    // 1. CAPTURA DO ESTADO
    var estado = document.getElementById('edit-end-estado').value;
    if (estado === "NOVO_CUSTOM") {
        estado = document.getElementById('input-estado-novo').value.trim().toUpperCase(); // Força maiúscula
        if (!estado) return mostrarNotificacao("Digite a sigla do Estado.", "erro");
    }

    // 2. CAPTURA DA CIDADE
    var cidade = document.getElementById('edit-end-cidade').value;
    if (cidade === "NOVO_CUSTOM") {
        cidade = document.getElementById('input-cidade-novo').value.trim();
        if (!cidade) return mostrarNotificacao("Digite o nome da Cidade.", "erro");
    }

    // 3. CAPTURA DO BAIRRO
    var bairro = document.getElementById('edit-end-bairro').value;
    if (bairro === "NOVO_CUSTOM") {
        bairro = document.getElementById('input-bairro-novo').value.trim();
        if (!bairro) return mostrarNotificacao("Digite o nome do novo bairro.", "erro");
    }

    if (!estado || !cidade || !bairro) {
        return mostrarNotificacao("Selecione Estado, Cidade e Bairro.", "erro");
    }

    // Monta string "Cidade - Estado"
    var cidadeFormatada = `${cidade} - ${estado}`;

    var dados = {
        idEndereco: id,
        cidade: cidadeFormatada,
        bairro: bairro,
        idTerritorio: document.getElementById('edit-end-territorio').value,
        rua: document.getElementById('edit-end-rua').value,
        numero: document.getElementById('edit-end-numero').value,
        referencia: document.getElementById('edit-end-ref').value,
        lat: document.getElementById('edit-end-lat').value,
        lng: document.getElementById('edit-end-lng').value
    };

    if (!dados.rua) return mostrarNotificacao("A rua é obrigatória.", "erro");

    mostrarNotificacao("Salvando...", "info");

    chamarAPI("salvarEnderecoGestao", dados).then(res => {
        if (res.erro) {
            mostrarNotificacao(res.erro, "erro");
        } else {
            mostrarNotificacao("Endereço salvo!", "sucesso");
            toggleModal('modal-endereco'); // ou o nome do modal que estiver usando

            // Força recarregamento da hierarquia local se algo novo foi cadastrado
            if (document.getElementById('input-estado-novo').value ||
                document.getElementById('input-cidade-novo').value ||
                document.getElementById('input-bairro-novo').value) {

                cacheLocais = {}; // Limpa cache
                carregarDadosLocais(); // Recarrega da planilha
            }

            // Recarrega a lista de endereços para mostrar a mudança
            carregarGestaoEnderecos();
        }
    });
}

// --- FUNÇÃO DO BOTÃO DE PROCESSAR (Faltava esta) ---
function executarProcessamentoRemoto() {
    if (!confirm("Isso irá reorganizar endereços e criar territórios baseados na configuração da planilha.\n\nATENÇÃO: Isso pode levar alguns segundos.\n\nDeseja continuar?")) return;

    mostrarNotificacao("Processando... aguarde.", "info");

    chamarAPI("processarTerritoriosAPI").then(r => {
        if (r.erro) {
            mostrarNotificacao("Erro: " + r.erro, "erro");
        } else {
            mostrarNotificacao(r.sucesso || "Processamento concluído!", "sucesso");
            // Recarrega as listas para mostrar os novos cartões
            carregarSistema();
            carregarListaTerritoriosGestao();
        }
    });
}


