const accessInfoServerHtmlPage = `
<html>
<head>
    <title>Access Info</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="background-color: #1e68c9ff; font-family: Arial, sans-serif; color: white;">
    <h1>Access Information</h1>
    <input type="text" placeholder="Enter your access information here" style="width: 100%; padding: 12px 20px; margin: 8px 0; border: none; border-radius: 4px;">
    <button style="background-color: #4CAF50; color: white; padding: 12px 20px; border: none; border-radius: 4px; cursor: pointer;">Submit</button>
    <p>This may take 30-60 seconds.</p>
    <script>
        document.querySelector('button').addEventListener('click', async () => {
            const input = document.querySelector('input').value;
            if (input) {
                try {
                    const json = JSON.parse(input);
                    const req = await fetch('/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: \`code=\${encodeURIComponent(JSON.stringify(json))}\`
                    });

                    if (req.ok) {
                        alert('Access information submitted successfully.');
                    } else {
                        const res = await req.json();
                        alert('Failed to submit access information.\\n' + res.error);
                    }
                } catch (e) {
                    alert('Invalid JSON format.');
                }
            } else {
                alert('Please enter your access information.');
            }
        });
    </script>
</body>
</html>
`;

module.exports = accessInfoServerHtmlPage;