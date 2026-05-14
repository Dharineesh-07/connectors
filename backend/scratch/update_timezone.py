import os
import re

root_dir = r'd:\chat\orgchat\backend\app'

replacements = [
    (re.compile(r'from datetime import datetime'), 'from datetime import datetime\nfrom app.utils.timezone import get_now_naive'),
    (re.compile(r'datetime\.utcnow\(\)'), 'get_now_naive()'),
    (re.compile(r'datetime\.utcnow'), 'get_now_naive'),
]

for root, dirs, files in os.walk(root_dir):
    for file in files:
        if file.endswith('.py') and file != 'timezone.py':
            path = os.path.join(root, file)
            with open(path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            new_content = content
            if 'utcnow' in content:
                # Add import if not present
                if 'from app.utils.timezone import get_now_naive' not in new_content:
                    if 'from datetime import datetime' in new_content:
                        new_content = new_content.replace('from datetime import datetime', 'from datetime import datetime\nfrom app.utils.timezone import get_now_naive')
                    else:
                        # Add at top
                        new_content = 'from app.utils.timezone import get_now_naive\n' + new_content
                
                new_content = new_content.replace('datetime.utcnow()', 'get_now_naive()')
                new_content = new_content.replace('datetime.utcnow', 'get_now_naive')
                
                if new_content != content:
                    with open(path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated {path}")
