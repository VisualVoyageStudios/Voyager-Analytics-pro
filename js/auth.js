// REGISTER

const registerForm =
document.getElementById("registerForm");

if(registerForm){

    registerForm.addEventListener(
        "submit",
        async (e)=>{

            e.preventDefault();

            const email =
            document.getElementById(
                "registerEmail"
            ).value;

            const password =
            document.getElementById(
                "registerPassword"
            ).value;

            const confirmPassword =
            document.getElementById(
                "confirmPassword"
            ).value;

            if(password !== confirmPassword){

                alert(
                    "Passwords do not match"
                );

                return;
            }

            try{

                const result =
                await registerUser({

                    email,
                    password

                });

                alert(
                    result.message ||
                    "Account created"
                );

                window.location.href =
                "login.html";

            }catch(error){

                console.error(error);

                alert(
                    "Registration failed"
                );
            }

        }
    );

}

// LOGIN

const loginForm =
document.getElementById("loginForm");

if(loginForm){

    loginForm.addEventListener(
        "submit",
        async (e)=>{

            e.preventDefault();

            const email =
            document.getElementById(
                "email"
            ).value;

            const password =
            document.getElementById(
                "password"
            ).value;

            try{

                const result =
                await loginUser({

                    email,
                    password

                });

                if(result.token){

                    localStorage.setItem(
                        "token",
                        result.token
                    );

                    window.location.href =
                    "dashboard/dashboard.html";

                }else{

                    alert(
                        result.message ||
                        "Login failed"
                    );

                }

            }catch(error){

                console.error(error);

                alert(
                    "Login failed"
                );
            }

        }
    );

}