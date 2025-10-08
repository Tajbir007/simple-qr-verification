const bcrypt = require('bcryptjs');

// এই ফাংশনটি পাসওয়ার্ড হ্যাশ করবে
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    console.log(hashedPassword);
}

// এখানে আপনার পছন্দসই পাসওয়ার্ড দিন
hashPassword('Demo@1234');