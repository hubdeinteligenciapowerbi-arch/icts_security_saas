// Simulação de envio de formulário de login
// Os dados do usuário precisam persistir em um database, ou a icts garante que os clientes se cadastrem de outra forma?

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    console.log("Formulário enviado (simulação)");
    window.location.href = "../homepage/index.html";
});