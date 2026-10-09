// Ticket fields are user-supplied: escape them before they go into innerHTML
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Function to create and display a result block
function renderResult(status, data = null) {
    const resultContainer = document.getElementById('result-container');
    resultContainer.innerHTML = '';
    resultContainer.classList.remove('hidden');
    document.getElementById('loading').classList.add('hidden');

    let statusText;
    let statusColorClass;
    let iconSvg;

    switch (status) {
        case 'authentic':
            statusText = 'Authentic';
            statusColorClass = 'bg-green-100 text-green-600';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
            break;
        case 'used':
            statusText = 'Already Used';
            statusColorClass = 'bg-yellow-100 text-yellow-600';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15v-2h2v2h-2zm0-4h2V7h-2v6z"/></svg>`;
            break;
        case 'disabled':
            statusText = 'Deactivated';
            statusColorClass = 'bg-gray-100 text-gray-700';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1.41 5.59L12 11.17l1.41-1.58a1 1 0 011.42 1.42L13.41 12l1.42 1.41a1 1 0 01-1.42 1.42L12 13.41l-1.41 1.42a1 1 0 01-1.42-1.42L10.59 12 9.17 10.59a1 1 0 011.42-1.42z"/></svg>`;
            break;
        case 'not-found':
            statusText = 'Not Authentic';
            statusColorClass = 'bg-red-100 text-red-600';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.71 13.29a1 1 0 01-1.42 1.42L12 13.41l-2.29 2.29a1 1 0 01-1.42-1.42L10.59 12l-2.29-2.29a1 1 0 011.42-1.42L12 10.59l2.29-2.29a1 1 0 011.42 1.42L13.41 12l2.29 2.29z"/></svg>`;
            break;
        default:
            // Default to an error state for unexpected status
            statusText = 'Error';
            statusColorClass = 'bg-yellow-100 text-yellow-600';
            iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>`;
            break;
    }

    let detailsHtml = '';
    if (status === 'authentic' && data) {
        detailsHtml = `
    <div class="mt-6 w-full text-left">
<p class="text-xl font-semibold text-gray-700">Ticket Holder Details</p>
<div class="mt-4 space-y-2 text-gray-600">
    <p class="text-lg"><strong>Name:</strong> ${escapeHtml(data.name)}</p>
    <p class="text-lg"><strong>Email:</strong> ${escapeHtml(data.email)}</p>
    <p class="text-lg"><strong>Phone:</strong> ${escapeHtml(data.phone)}</p>
    <p class="text-lg"><strong>Segments:</strong> ${escapeHtml(data.segments)}</p> <!-- NEW -->
    <p class="text-lg"><strong>Institute:</strong> ${escapeHtml(data.institute)}</p> <!-- NEW -->
    <p class="text-lg"><strong>Group:</strong> ${escapeHtml(data.group)}</p> <!-- NEW -->
    <p class="text-lg"><strong>Class:</strong> ${escapeHtml(data.class)}</p> <!-- NEW -->
</div>
    </div>
`;
    } else if (status === 'not-found') {
        detailsHtml = `
            <p class="mt-4 text-gray-500 font-medium text-lg">
                The ticket ID provided is not found in our records.
            </p>
        `;
    } else if (status === 'used') {
        detailsHtml = `
            <p class="mt-4 text-gray-500 font-medium text-lg">
                This ticket has already been used and is no longer valid.
            </p>
        `;
    }


    resultContainer.innerHTML = `
        <div class="p-6 rounded-full ${statusColorClass} flex items-center justify-center mb-6">
            ${iconSvg}
        </div>
        <h2 class="text-4xl font-bold ${status === 'authentic' ? 'text-green-600' : 'text-red-600'} mb-2">
            ${statusText}
        </h2>
        ${detailsHtml}
    `;
}

async function verifyTicket() {
    try {
        // Get ticket ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const ticketId = urlParams.get('id');

        if (!ticketId) {
            throw new Error("No ticket ID found in URL. Please scan a valid QR code.");
        }

        const response = await fetch(`/api/verify/${encodeURIComponent(ticketId)}`);
        const result = await response.json();

        // Every verify response carries a status; anything else (e.g. 429 rate limit) is an error
        renderResult(result.status || 'error', result.data);

    } catch (error) {
        console.error("Verification failed:", error);
        const resultContainer = document.getElementById('result-container');
        resultContainer.classList.remove('hidden');
        document.getElementById('loading').classList.add('hidden');
        resultContainer.innerHTML = `
            <div class="p-6 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-16 h-16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
            </div>
            <h2 class="text-4xl font-bold text-yellow-600 mb-2">Error</h2>
            <p class="mt-4 text-gray-500 font-medium text-lg text-center">
                An error occurred during verification. Please check the console for details.
            </p>
        `;
    }
}

// Run the verification process when the page loads
document.addEventListener('DOMContentLoaded', verifyTicket);

