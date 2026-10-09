document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const messageDiv = document.getElementById('message');

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            // The session lives in an HttpOnly cookie set by the server
            window.location.href = '/admin.html';
        } else {
            messageDiv.textContent = data.message || 'Login failed. Please check your credentials.';
            messageDiv.classList.remove('hidden');
        }
    } catch (error) {
        messageDiv.textContent = 'Failed to connect to the server. Please ensure the API is running.';
        messageDiv.classList.remove('hidden');
        console.error('Login error:', error);
    }
});
