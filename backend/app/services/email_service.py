import logging

logger = logging.getLogger(__name__)

async def send_invite_email(email: str, name: str, temp_password: str) -> None:
    """
    Simulates sending an invite email to a new employee.
    In a real production environment, this would integrate with an SMTP server
    or a third-party email provider like SendGrid, AWS SES, etc.
    """
    email_body = f"""
    ========================================================
    MOCK EMAIL SERVICE - INVITE EMAIL
    ========================================================
    To: {email}
    Subject: Welcome to OrgChat, {name}!
    
    Hi {name},
    
    An admin has created an account for you on OrgChat.
    
    Your temporary password is: {temp_password}
    
    Please log in using this temporary password and make sure
    to update your profile and change your password immediately.
    
    Welcome aboard!
    ========================================================
    """
    
    logger.info("Sending invite email to %s", email)
    print(email_body)  # Print to console for easy visibility during development
