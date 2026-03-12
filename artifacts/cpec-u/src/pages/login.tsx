import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";

const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Le mot de passe est requis"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Connexion réussie", description: `Bienvenue ${data.user.name}` });
        if (data.user.role === "admin") setLocation("/admin");
        else if (data.user.role === "teacher") setLocation("/teacher");
        else setLocation("/student");
      },
      onError: () => {
        toast({
          title: "Erreur de connexion",
          description: "Identifiants incorrects. Veuillez réessayer.",
          variant: "destructive",
        });
      },
    },
  });

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  return (
    <div className="min-h-screen w-full flex bg-background">
      <div className="hidden lg:flex flex-1 relative bg-sidebar overflow-hidden">
        <div className="absolute inset-0 bg-primary/20 mix-blend-multiply z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Campus" 
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-sidebar via-sidebar/50 to-transparent z-20" />
        
        <div className="absolute bottom-16 left-16 z-30 max-w-xl text-sidebar-foreground">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="Logo" className="w-24 h-24 mb-8 object-contain rounded-2xl shadow-lg" />
            <h1 className="text-5xl font-serif font-bold leading-tight mb-4 text-white">
              L'Excellence Académique <br/> au Quotidien.
            </h1>
            <p className="text-lg text-sidebar-foreground/80">
              Système de gestion académique intégré pour l'administration, les enseignants et les étudiants.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="w-full max-w-md"
        >
          <Card className="border-none shadow-2xl bg-card/50 backdrop-blur-xl">
            <CardHeader className="space-y-4 pb-8">
              <div className="lg:hidden flex justify-center mb-4">
                <img src={`${import.meta.env.BASE_URL}images/logo.jpg`} alt="Logo" className="w-20 h-20 object-contain rounded-xl shadow-md" />
              </div>
              <CardTitle className="text-3xl font-serif text-center">Connexion</CardTitle>
              <CardDescription className="text-center text-base">
                Accédez à votre espace sécurisé CPEC-U
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit((data) => loginMutation.mutate({ data }))} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-foreground/80 font-semibold">Adresse Email</Label>
                  <Input 
                    id="email" 
                    placeholder="prenom.nom@cpec-u.edu" 
                    {...register("email")}
                    className="h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                  />
                  {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-foreground/80 font-semibold">Mot de passe</Label>
                  <Input 
                    id="password" 
                    type="password" 
                    placeholder="••••••••" 
                    {...register("password")}
                    className="h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20"
                  />
                  {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg font-semibold shadow-lg shadow-primary/25 hover:shadow-xl transition-all"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Connexion en cours..." : "Se connecter"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
