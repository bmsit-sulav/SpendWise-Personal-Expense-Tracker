#include <iostream>
#include <stdlib.h>
#include<string>
using namespace std;
#include "Expense.h"

Expense::Expense(int Id, double Amount, string Category,string Date, string Description){
    this->Id=Id;
    this->Amount=Amount;
    this->Category=Category;
    this->Date=Date;
    this->Description=Description;
}
int Expense::getId() const{
    return Id;
}
double Expense::getAmount() const{
    return Amount;
}
string Expense::getCategory() const{
    return Category;
}
string Expense::getDate() const{
    return Date;
}
string Expense::getDescription() const{
    return Description;
}