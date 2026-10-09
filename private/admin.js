document.addEventListener('DOMContentLoaded', () => {
    const logoutButton = document.getElementById('logout-btn');
    const appDiv = document.getElementById('app');
    const addBtn = document.getElementById('add-btn');
    const generateBtn = document.getElementById('generate-btn');
    const ticketHoldersContainer = document.getElementById('ticket-holders-container');
    const qrCodesDisplay = document.getElementById('qr-codes-display');
    const loadingSpinner = document.getElementById('loading-spinner');
    const errorMessage = document.getElementById('error-message');
    const errorText = document.getElementById('error-text');
    const resetAllButton = document.getElementById('reset-all-btn');

    const messageBox = document.getElementById('message-box');
    const messageText = document.getElementById('message-text');

    // The server only serves this page to a logged-in admin; the session is an HttpOnly cookie
    // that the browser sends automatically. If it has expired, go back to the login page.
    async function api(url, options) {
        const response = await fetch(url, options);
        if (response.status === 401) {
            window.location.href = '/login.html';
        }
        return response;
    }

    // Function to show a temporary message
    function showMessage(text, type = 'success') {
        messageText.textContent = text;
        messageBox.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'text-green-700', 'text-red-700');
        if (type === 'success') {
            messageBox.classList.add('bg-green-100', 'text-green-700');
        } else {
            messageBox.classList.add('bg-red-100', 'text-red-700');
        }
        messageBox.classList.remove('scale-95', 'opacity-0');
        messageBox.classList.add('scale-100', 'opacity-100');
        setTimeout(() => {
            messageBox.classList.remove('scale-100', 'opacity-100');
            messageBox.classList.add('scale-95', 'opacity-0');
            setTimeout(() => messageBox.classList.add('hidden'), 300);
        }, 3000);
    }

    async function parseResponse(response) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return response.json();
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch {
            return { message: text || 'Request failed.' };
        }
    }

    // Fetch and display all tickets
    async function fetchAllTickets() {
        const isInitialLoad = qrCodesDisplay.innerHTML === '';
        if (isInitialLoad) {
            loadingSpinner.classList.remove('hidden');
        }

        try {
            const response = await api('/api/tickets');
            const data = await parseResponse(response);
            if (response.ok) {
                const currentTicketIds = Array.from(qrCodesDisplay.querySelectorAll('[data-id]')).map(el => el.getAttribute('data-id')).sort();
                const newTicketIds = data.tickets.map(t => t.id).sort();
                if (JSON.stringify(currentTicketIds) !== JSON.stringify(newTicketIds)) {
                    renderTickets(data.tickets);
                } else {
                    data.tickets.forEach(ticket => {
                        const container = qrCodesDisplay.querySelector(`[data-id="${ticket.id}"]`);
                        if (container) {
                            const statusIndicator = container.querySelector('.status-indicator');
                            const resetButton = container.querySelector('.reset-btn');
                            const deleteButton = container.querySelector('.delete-btn');

                            statusIndicator.textContent = getStatusLabel(ticket.status, ticket.foodReceived);
                            statusIndicator.className = `status-indicator px-2 py-1 mt-2 rounded-full text-xs font-bold ${getStatusClass(ticket.status, ticket.foodReceived)}`;

                            resetButton.disabled = ticket.status === 'active';
                            resetButton.textContent = 'Reset';
                            deleteButton.disabled = false;
                        }
                    });
                }
            } else {
                errorMessage.classList.remove('hidden');
                errorText.textContent = data.message || 'Failed to fetch tickets.';
            }
        } catch (error) {
            errorMessage.classList.remove('hidden');
            errorText.textContent = 'Failed to connect to the server.';
        } finally {
            loadingSpinner.classList.add('hidden');
        }
    }

    function getStatusLabel(status, foodReceived) {
        if (status === 'active') return 'ACTIVE';
        if (foodReceived) return '✓ USED + FOOD RECEIVED';
        return 'USED';
    }

    function getStatusClass(status, foodReceived) {
        if (status === 'active') return 'bg-green-200 text-green-800';
        if (foodReceived) return 'bg-amber-200 text-amber-800';
        return 'bg-red-200 text-red-800';
    }

    function sanitizeFileName(value) {
        return String(value || 'ticket')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80) || 'ticket';
    }

    function getQrDataUrl(qrContainer) {
        const canvas = qrContainer.querySelector('canvas');
        if (canvas) {
            return canvas.toDataURL('image/png');
        }

        const img = qrContainer.querySelector('img');
        if (img && img.src) {
            return img.src;
        }

        return '';
    }

    let qrRenderVersion = 0;

    function generateQrCodesInBatches(qrJobs) {
        const renderVersion = ++qrRenderVersion;
        let jobIndex = 0;
        const jobsPerFrame = 4;

        function processBatch() {
            if (renderVersion !== qrRenderVersion) {
                return;
            }

            const batchEnd = Math.min(jobIndex + jobsPerFrame, qrJobs.length);
            while (jobIndex < batchEnd) {
                const { container, ticket } = qrJobs[jobIndex++];
                container.textContent = '';
                new QRCode(container, {
                    text: `${window.location.protocol}//${window.location.host}/index.html?id=${ticket.id}`,
                    width: 192,
                    height: 192,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            }

            if (jobIndex < qrJobs.length) {
                requestAnimationFrame(processBatch);
            }
        }

        requestAnimationFrame(processBatch);
    }

    function renderTickets(tickets) {
        qrRenderVersion++;
        qrCodesDisplay.innerHTML = '';
        if (tickets.length === 0) {
            qrCodesDisplay.innerHTML = '<p class="col-span-full text-center text-gray-500 font-medium">No tickets generated yet.</p>';
            return;
        }
        const qrJobs = [];
        tickets.forEach(ticket => {
            const qrCodeContainer = document.createElement('div');
            qrCodeContainer.className = 'flex flex-col items-center space-y-2 bg-gray-50 p-4 rounded-xl shadow-sm border border-gray-200';
            qrCodeContainer.setAttribute('data-id', ticket.id);

            const qrCodeDiv = document.createElement('div');
            qrCodeDiv.className = 'w-48 h-48 border border-gray-300 p-2 bg-white rounded-lg shadow-inner flex items-center justify-center text-sm text-gray-400';
            qrCodeDiv.textContent = 'Preparing QR code...';

            const qrCodeLink = document.createElement('a');
            qrCodeLink.href = `/index.html?id=${ticket.id}`;
            qrCodeLink.target = '_blank';
            qrCodeLink.className = 'block hover:scale-105 transition-transform';
            qrCodeLink.title = `Click to verify ${ticket.name}'s ticket`;

            qrCodeLink.appendChild(qrCodeDiv);

            const ticketDetails = document.createElement('div');
            ticketDetails.className = 'ticket-details flex flex-col items-center text-center';

            const qrCodeName = document.createElement('p');
            qrCodeName.textContent = ticket.name;
            qrCodeName.className = 'text-lg text-gray-800 font-semibold truncate w-full';

            const qrCodeEmail = document.createElement('p');
            qrCodeEmail.textContent = ticket.email;
            qrCodeEmail.className = 'text-sm text-gray-500 truncate w-full';

            const statusIndicator = document.createElement('div');
            statusIndicator.className = `status-indicator px-2 py-1 mt-2 rounded-full text-xs font-bold ${getStatusClass(ticket.status, ticket.foodReceived)}`;
            statusIndicator.textContent = getStatusLabel(ticket.status, ticket.foodReceived);

            const qrCodeSegments = document.createElement('p');
            qrCodeSegments.textContent = `Segments: ${ticket.segments}`;
            qrCodeSegments.className = 'text-sm text-gray-600 truncate w-full';

            const qrCodeGroup = document.createElement('p');
            qrCodeGroup.textContent = `Group: ${ticket.group}`;
            qrCodeGroup.className = 'text-sm text-gray-600 truncate w-full';

            const qrCodeInstitute = document.createElement('p');
            qrCodeInstitute.textContent = `Institute: ${ticket.institute}`;
            qrCodeInstitute.className = 'text-sm text-gray-600 truncate w-full';

            const qrCodeClass = document.createElement('p');
            qrCodeClass.textContent = `Class: ${ticket.class}`;
            qrCodeClass.className = 'text-sm text-gray-600 truncate w-full';

            const qrCodePhone =document.createElement('p');
            qrCodePhone.textContent = `Phone: ${ticket.phone}`;
            qrCodePhone.className = 'text-sm text-gray-600 truncate w-full';
            
            ticketDetails.appendChild(qrCodeName);
            ticketDetails.appendChild(qrCodeEmail);
            ticketDetails.appendChild(qrCodePhone);
            ticketDetails.appendChild(qrCodeSegments);
            ticketDetails.appendChild(qrCodeGroup);
            ticketDetails.appendChild(qrCodeInstitute);
            ticketDetails.appendChild(qrCodeClass);
            ticketDetails.appendChild(statusIndicator);

            qrCodeContainer.appendChild(qrCodeLink);
            qrCodeContainer.appendChild(ticketDetails);

            // Reset Button
            const resetButton = document.createElement('button');
            resetButton.textContent = 'Reset';
            resetButton.className = 'reset-btn mt-2 px-4 py-1 text-sm bg-indigo-500 text-white font-semibold rounded-full shadow-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-opacity-75 transition-all duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed';
            if (ticket.status === 'active') {
                resetButton.disabled = true;
            }
            resetButton.addEventListener('click', async () => {
                const originalText = resetButton.textContent;
                resetButton.textContent = 'Resetting...';
                resetButton.disabled = true;

                try {
                    const response = await api(`/api/reset-ticket/${ticket.id}`, {
                        method: 'POST'
                    });
                    const data = await parseResponse(response);
                    if (response.ok) {
                        showMessage(`Ticket for ${ticket.name} has been reset.`);
                        fetchAllTickets();
                    } else {
                        showMessage(data.message || 'Failed to reset ticket.', 'error');
                        resetButton.textContent = originalText;
                        resetButton.disabled = false;
                    }
                } catch (error) {
                    showMessage('Network error. Failed to reset ticket.', 'error');
                    resetButton.textContent = originalText;
                    resetButton.disabled = false;
                }
            });

            // Delete Button
            const deleteButton = document.createElement('button');
            deleteButton.textContent = 'Delete';
            deleteButton.className = 'delete-btn ml-2 mt-2 px-4 py-1 text-sm bg-red-500 text-white font-semibold rounded-full shadow-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75 transition-all duration-200';
            deleteButton.addEventListener('click', async () => {
                if (confirm(`Are you sure you want to delete the ticket for ${ticket.name}?`)) {
                    const originalText = deleteButton.textContent;
                    deleteButton.textContent = 'Deleting...';
                    deleteButton.disabled = true;

                    try {
                        const response = await api(`/api/delete-ticket/${ticket.id}`, {
                            method: 'DELETE'
                        });
                        const data = await parseResponse(response);
                        if (response.ok) {
                            showMessage(`Ticket for ${ticket.name} has been deleted.`);
                        } else {
                            showMessage(data.message || 'Failed to delete ticket.', 'error');
                        }
                    } catch (error) {
                        showMessage('Network error. Failed to delete ticket.', 'error');
                        console.error('Delete fetch error:', error);
                    } finally {
                        deleteButton.textContent = originalText;
                        deleteButton.disabled = false;
                        fetchAllTickets();
                    }
                }
            });
            // Download Button
            const downloadButton = document.createElement('a');
            downloadButton.textContent = 'Save Image';
            downloadButton.href = '#';
            downloadButton.className = 'mt-2 inline-flex items-center justify-center px-4 py-1 text-sm bg-slate-600 text-white font-semibold rounded-full shadow-md hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-opacity-75 transition-all duration-200';
            downloadButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                const dataUrl = getQrDataUrl(qrCodeDiv);
                if (!dataUrl) return;

                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = `${sanitizeFileName(ticket.name + ' ' + ticket.email)}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            });

            const buttonGroup = document.createElement('div');
            buttonGroup.className = 'flex flex-wrap justify-center gap-2 mt-2';
            buttonGroup.appendChild(resetButton);
            buttonGroup.appendChild(deleteButton);
            buttonGroup.appendChild(downloadButton);

            qrCodeContainer.appendChild(buttonGroup);

            qrCodesDisplay.appendChild(qrCodeContainer);

            qrJobs.push({ container: qrCodeDiv, ticket });
        });
        generateQrCodesInBatches(qrJobs);
    }

    // Add new ticket holder input fields (responsive grid)
    function addTicketHolderField() {
        const newTicketHolderDiv = document.createElement('div');
        newTicketHolderDiv.className = 'ticket-holder-row bg-gray-50 p-4 rounded-lg border border-gray-200 relative';
        newTicketHolderDiv.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Name</label>
                    <input type="text" placeholder="Enter name" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" required>
                </div>
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Email</label>
                    <input type="email" placeholder="Enter email" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" required>
                </div>
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Phone</label>
                    <input type="tel" placeholder="Enter Phone Number" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" required>
                </div>
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Segments</label>
                    <select data-field="segments" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                        <option value="Photography Exhibition (Framed) + Others">Photography Exhibition (Framed) + Others</option>
                        <option value="Short Film Screening + Others">Short Film Screening + Others</option>
                        <option value="Musical Showdown + Others">Musical Showdown + Others</option>
                        <option value="Movie Quiz + Others">Movie Quiz + Others</option>
                        <option value="Guess the “?” + Others">Guess the “?” + Others</option>
                        <option value="Content Writing + Others">Content Writing + Others</option>
                        <option value="Stand-Up Performance + Others">Stand-Up Performance + Others</option>
                        <option value="Free Art + Others">Free Art + Others</option>
                        <option value="Mandala Art + Others">Mandala Art + Others</option>
                        </select>
                </div>
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Group</label>
                    <select data-field="group" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400">
                        <option value="Junior">Junior(6-10)</option>
                        <option value="Senior">Senior(11-University)</option>
                    </select>
                </div>
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Institute</label>
                    <input type="text" data-field="institute" placeholder="Enter Institute Name" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" required>
                </div>
                <div class="space-y-1">
                    <label class="text-sm font-medium text-gray-700">Class</label>
                    <input type="text" data-field="academyclass" placeholder="Enter Class" class="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400" required>
                </div>
            </div>
            <button type="button" class="remove-btn absolute top-2 right-2 text-gray-400 hover:text-red-500 transition-colors" title="Remove this ticket">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
            </button>
        `;
        ticketHoldersContainer.appendChild(newTicketHolderDiv);
        updateRemoveButtons();
    }

    // Update the state of remove buttons
    function updateRemoveButtons() {
        const removeBtns = document.querySelectorAll('.remove-btn');
        const isSingleField = removeBtns.length <= 1;
        removeBtns.forEach(btn => btn.disabled = isSingleField);
    }

    // Event listener for adding ticket fields
    addBtn.addEventListener('click', addTicketHolderField);

    // Event listener for removing ticket fields
    ticketHoldersContainer.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.remove-btn');
        if (removeBtn) {
            removeBtn.closest('.ticket-holder-row').remove();
            updateRemoveButtons();
        }
    });

    // Event listener for resetting all tickets
    resetAllButton.addEventListener('click', async () => {
        if (!confirm('Reset all tickets back to active status?')) {
            return;
        }

        resetAllButton.disabled = true;
        resetAllButton.textContent = 'Resetting...';
        loadingSpinner.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        try {
            const response = await api('/api/reset-all-tickets', {
                method: 'POST'
            });
            const data = await parseResponse(response);

            if (response.ok) {
                showMessage(data.message || 'All tickets have been reset.');
                fetchAllTickets();
            } else {
                showMessage(data.message || 'Failed to reset all tickets.', 'error');
            }
        } catch (error) {
            showMessage('Failed to connect to the server.', 'error');
            console.error('Reset all fetch error:', error);
        } finally {
            resetAllButton.disabled = false;
            resetAllButton.textContent = 'Reset All';
            loadingSpinner.classList.add('hidden');
        }
    });

    // Event listener for generating tickets
    generateBtn.addEventListener('click', async () => {
        const ticketHolders = Array.from(ticketHoldersContainer.children).map(div => {
            return {
                name: div.querySelector('input[type="text"]').value,
                email: div.querySelector('input[type="email"]').value,
                phone: div.querySelector('input[type="tel"]').value,
                segments: div.querySelector('[data-field="segments"]').value,
                group: div.querySelector('[data-field="group"]').value,
                institute: div.querySelector('[data-field="institute"]').value,
                class: div.querySelector('[data-field="academyclass"]').value
            };
        }).filter(holder => holder.name && holder.email && holder.phone);

        if (ticketHolders.length === 0) {
            showMessage('Please enter at least one name, email, phone.', 'error');
            return;
        }

        generateBtn.disabled = true;
        loadingSpinner.classList.remove('hidden');
        qrCodesDisplay.innerHTML = '';
        errorMessage.classList.add('hidden');

        try {
            const response = await api('/api/generate-tickets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ticketHolders })
            });
            const data = await response.json();
            if (response.ok) {
                showMessage('Tickets generated successfully!');
                fetchAllTickets();
            } else {
                showMessage(data.error || data.message || 'An unexpected error occurred.', 'error');
            }
        } catch (error) {
            showMessage('Failed to connect to the server.', 'error');
            console.error('Fetch error:', error);
        } finally {
            loadingSpinner.classList.add('hidden');
            generateBtn.disabled = false;
        }
    });

    // Initial setup
    addTicketHolderField();
    fetchAllTickets();

    // Search functionality
const searchInput = document.getElementById('search-input');
function filterTickets() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const ticketContainers = qrCodesDisplay.querySelectorAll('[data-id]');
    ticketContainers.forEach(container => {
const detailsText = container.innerText.toLowerCase();
const isMatch = !searchTerm || detailsText.includes(searchTerm);
container.style.display = isMatch ? '' : 'none';
    });
}
searchInput.addEventListener('input', filterTickets);

    // Set up a periodic refresh to get the latest status
    setInterval(fetchAllTickets, 5000);

    logoutButton.addEventListener('click', async () => {
        // Invalidate the session on the server, not just in the browser
        await fetch('/api/logout', { method: 'POST' }).catch(() => {});
        window.location.href = '/login.html';
    });
});
